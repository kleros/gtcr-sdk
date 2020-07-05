import { ethers, BigNumber } from 'ethers'
import { gtcrDecode } from '@kleros/gtcr-encoder'
import { LogDescription } from 'ethers/lib/utils'
import { abi as _gtcrABI } from '@kleros/tcr/build/contracts/GeneralizedTCR.json'
import { abi as _gtcrViewABI } from '@kleros/tcr/build/contracts/GeneralizedTCRView.json'

import getSweepIntervals from '../utils/get-sweep-intervals'
import { DEFAULT_FILTER } from '../utils/filter'
import { MetaEvidence, Item } from './types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

export default class GeneralizedTCR {
  gtcrInstance: ethers.Contract
  gtcrViewInstance: ethers.Contract
  blocksPerRequest: number
  provider: ethers.providers.JsonRpcProvider
  deploymentBlock: number
  gateway: string

  constructor(
    _ethereum:
      | ethers.providers.ExternalProvider
      | ethers.providers.JsonRpcFetchFunc,
    _tcrAddress: string,
    _tcrViewAddress: string,
    _gateway: string,
    _deploymentBlock = 0,
    blockTimeMilliseconds?: number,
  ) {
    this.provider = new ethers.providers.Web3Provider(_ethereum)
    this.gateway = _gateway
    this.gtcrInstance = new ethers.Contract(
      _tcrAddress,
      _gtcrABI,
      this.provider,
    )
    this.gtcrViewInstance = new ethers.Contract(
      _tcrViewAddress,
      _gtcrViewABI,
      this.provider,
    )

    this.deploymentBlock = _deploymentBlock
    const blocksPerMinute = Math.floor(
      60 / (blockTimeMilliseconds || 15000 / 1000),
    )
    this.blocksPerRequest = blocksPerMinute * 60 * 24 * 30 * 4
  }

  private async getEvents(eventName: string): Promise<LogDescription[]> {
    // We fetch events in batches to avoid timeouts by the provider.
    const height = await this.provider.getBlockNumber()
    const intervals = getSweepIntervals(
      this.deploymentBlock,
      height,
      this.blocksPerRequest,
    )

    return (
      await Promise.all(
        intervals.map(async (interval) =>
          this.gtcrInstance.queryFilter(
            this.gtcrInstance.filters[eventName](),
            interval.fromBlock,
            interval.toBlock,
          ),
        ),
      )
    )
      .reduce((acc, curr) => [...acc, ...curr])
      .map((e) => this.gtcrInstance.interface.parseLog(e))
  }

  public async getLatestMetaEvidence(): Promise<MetaEvidence[]> {
    const metaEvidenceURIs = (await this.getEvents('MetaEvidence')).map(
      (e) => e.args._evidence,
    )

    const registrationMetaEvidenceURI =
      metaEvidenceURIs[metaEvidenceURIs.length - 2]
    const removalMetaEvidenceURI = metaEvidenceURIs[metaEvidenceURIs.length - 1]

    const [registrationMetaEvidence, removalMetaEvidence] = await Promise.all(
      (
        await Promise.all([
          fetch(`${this.gateway}${registrationMetaEvidenceURI}`),
          fetch(`${this.gateway}${removalMetaEvidenceURI}`),
        ])
      ).map((response) => response.json()),
    )

    return [registrationMetaEvidence, removalMetaEvidence]
  }

  public async getItem(_itemID: string): Promise<Item> {
    const [registrationMetaEvidence] = await this.getLatestMetaEvidence()
    const {
      metadata: { columns },
    } = registrationMetaEvidence

    const item = await this.gtcrViewInstance.getItem(
      this.gtcrInstance.address,
      _itemID,
    )

    return {
      ...item,
      decodedData: gtcrDecode({ columns, values: item.data }),
    }
  }

  public async getItems(
    _options = {
      oldestFirst: false,
      account: ZERO_ADDRESS,
      page: 1,
      itemsPerPage: 100,
      itemsPerRequest: 10000,
      filter: DEFAULT_FILTER,
    },
  ): Promise<Item[]> {
    const {
      itemsPerRequest,
      oldestFirst,
      account,
      page,
      itemsPerPage,
      filter,
    } = _options

    // The data must be fetched in batches to avoid timeouts.
    // We calculate the number of requests required according
    // to the number of items in the TCR.
    //
    // The meta evidence file of Generalized TCRs include an extra
    // filed: metadata. The metadata obect includes the columns field
    // requeried to decode the data.
    // We send both requests in parallel.
    const [itemCount, [registrationMetaEvidence]] = await Promise.all([
      (await this.gtcrInstance.itemCount()).toNumber(),
      await this.getLatestMetaEvidence(),
    ])

    // Number calls required to fetch all the data required.
    const requests = Math.ceil(itemCount / itemsPerRequest)
    let request = 1
    let target = [BigNumber.from(0), itemCount > 0, false]
    while (request <= requests && !target[2]) {
      target = await this.gtcrViewInstance.findIndexForPage(
        this.gtcrInstance.address,
        [page, itemsPerPage, itemsPerRequest, Number(target[0])],
        [...filter, oldestFirst],
        account,
      )
      request++
    }
    const cursorIndex = Number(target[0])

    // Edge case: Query items sets the cursor to the last item if
    // we are sorting by the newest items and the cursor index is 0.
    // This means we must take special care if the last page has a
    // single item.
    let encodedItems: any
    if (cursorIndex === 0 && !oldestFirst && page !== 1)
      encodedItems = await this.gtcrViewInstance.queryItems(
        this.gtcrInstance.address,
        0,
        1,
        filter,
        true,
        account,
      )
    else
      encodedItems = await this.gtcrViewInstance.queryItems(
        this.gtcrInstance.address,
        cursorIndex,
        itemsPerPage,
        filter,
        oldestFirst,
        account,
      )

    // Filter out empty slots from the results.
    encodedItems = encodedItems[0].filter(
      (item: any) => item.ID !== ZERO_BYTES32,
    )

    const {
      metadata: { columns },
    } = registrationMetaEvidence
    const decodedData = encodedItems.map((item: any) => ({
      ...item,
      decodedData: gtcrDecode({ columns, values: item.data }),
    }))
    return decodedData
  }
}
