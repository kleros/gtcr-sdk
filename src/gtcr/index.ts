import { ethers, BigNumber } from 'ethers'
import { gtcrDecode } from '@kleros/gtcr-encoder'
import { LogDescription } from 'ethers/lib/utils'
import fetch from 'cross-fetch'
import { abi as _gtcrABI } from '@kleros/tcr/build/contracts/GeneralizedTCR.json'
import { abi as _gtcrViewABI } from '@kleros/tcr/build/contracts/GeneralizedTCRView.json'
import { abi as _arbitratorABI } from '@kleros/erc-792/build/contracts/IArbitrator.json'

import getSweepIntervals from '../utils/get-sweep-intervals'
import { DEFAULT_FILTER } from '../utils/filter'
import { MetaEvidence, Item, QueryOptions } from './types'

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
  network?: ethers.providers.Network

  constructor(
    _ethereum:
      | ethers.providers.ExternalProvider
      | ethers.providers.JsonRpcFetchFunc
      | ethers.providers.JsonRpcProvider
      | ethers.providers.Web3Provider,
    _tcrAddress: string,
    _tcrViewAddress: string,
    _gateway: string,
    _deploymentBlock = 0,
    blockTimeMilliseconds?: number,
  ) {
    this.provider =
      _ethereum instanceof ethers.providers.JsonRpcProvider ||
      _ethereum instanceof ethers.providers.Web3Provider
        ? _ethereum
        : new ethers.providers.Web3Provider(_ethereum)
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
    this.blocksPerRequest = blocksPerMinute * 60 * 24 * 30 * 4 * 10
  }

  public async getNetwork(): Promise<ethers.providers.Network> {
    if (this.network) return this.network

    this.network = await this.provider.getNetwork()
    return this.network
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

  /**
   * @returns {Promise<MetaEvidence[]>} The array with the most recent meta evidence files for this TCR. First item is the meta evidence used for registration requests and the sencod item is the meta evidence used for removal requests.
   */
  public async getLatestMetaEvidence(): Promise<MetaEvidence[]> {
    const metaEvidenceURIs = (await this.getEvents('MetaEvidence')).map(
      (e) => e.args._evidence,
    )

    if (metaEvidenceURIs.length === 0)
      throw new Error(
        `No meta evidence found for TCR at ${this.gtcrInstance.address}, ${
          (await this.getNetwork()).name
        }.${
          this.deploymentBlock !== 0 &&
          ' List deployment block set to ${this.deploymentBlock}'
        }`,
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

  /**
   * @param {string} _itemID The item ID. The item ID is the keccak256 hash of its content.
   * @returns {Promise<Item>} An object containing the item data as well as the state of the latest request. Please note that the `disputed` field is not about whether the item is currently disputed or not, but rather if the latest request was ever disputed (i.e. if there was a dispute, and the final ruling was to accept the request, the item will have status 'Accepted' and disputed will still be `true`.)
   */
  public async getItem(_itemID: string): Promise<Item> {
    const [registrationMetaEvidence] = await this.getLatestMetaEvidence()
    const {
      metadata: { columns },
    } = registrationMetaEvidence

    const item = await this.gtcrViewInstance.getItem(
      this.gtcrInstance.address,
      _itemID,
    )

    let challengeRemainingTime = 0
    if (item.status > 1) {
      // i.e. If it has a pending request.
      const [challengePeriodDuration, block] = await Promise.all([
        this.gtcrInstance.challengePeriodDuration(),
        this.provider.getBlock('latest'),
      ])

      const { timestamp } = block
      challengeRemainingTime =
        Number(item.submissionTime) +
        Number(challengePeriodDuration) -
        timestamp
    }

    return {
      ...item,
      decodedData: gtcrDecode({ columns, values: item.data }),
      challengeRemainingTime,
    }
  }

  /**
   * @param {object} _options The query paramters.
   * @param {boolean} _options.oldestFirst Whether to return the oldest items first. By default the query will return the newest items first.
   * @param {boolean[]} _options.filter The filter to use when querying items. Each column in the array means.
   * - Include absent items in result;
   * - Include registered items in result;
   * - Include items with registration requests that are not disputed in result;
   * - Include items with clearing requests that are not disputed in result;
   * - Include disputed items with registration requests in result;
   * - Include disputed items with clearing requests in result;
   * - Include items with a request by _party;
   * - Include items challenged by _party.
   * @param {number} _options.page The page to return. Takes into account the filter used.
   * @param {number} _options.itemsPerPage The number of items per page.
   * @param {number} _options.itemsPerRequest The number of items to scan for a given filter.
   * @param {string} _options.account This is the Ethereum address used when filtering by requester and challenger.
   * @param {number} _options.limit The maximum number of items to return. If set to 0 will return _count items.
   * @returns {Promise<Item[]>} A list of items matching the filter criteria.
   */
  public async getItems(_options?: QueryOptions): Promise<Item[]> {
    _options = _options || {}
    const oldestFirst = _options.oldestFirst || false,
      filter = _options.filter || DEFAULT_FILTER,
      page = _options.page || 1,
      itemsPerPage = _options.itemsPerPage || 100,
      itemsPerRequest = _options.itemsPerRequest || 1000,
      account = _options.account || ZERO_ADDRESS,
      limit = _options.limit || 0

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

    // Edge case: The queryItems function sets the cursor to the last item if
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
        limit,
      )
    else
      encodedItems = await this.gtcrViewInstance.queryItems(
        this.gtcrInstance.address,
        cursorIndex,
        itemsPerPage,
        filter,
        oldestFirst,
        account,
        limit,
      )

    // Filter out empty slots from the results.
    encodedItems = encodedItems[0].filter(
      (item: any) => item.ID !== ZERO_BYTES32,
    )

    const {
      metadata: { columns },
    } = registrationMetaEvidence
    const decodedData: Item[] = encodedItems.map((item: any) => ({
      ...item,
      decodedData: gtcrDecode({ columns, values: item.data }),
    }))
    return decodedData
  }

  /**
   * Get the total amount of ETH (in wei) required to submit an item.
   *
   * @returns {Promise<BigNumber>} The ETH deposit in wei required to submit an item.
   */
  public async getSubmissionDeposit(): Promise<BigNumber> {
    const [
      arbitratorAddress,
      arbitratorExtraData,
      submissionBaseDeposit,
    ] = await Promise.all([
      this.gtcrInstance.arbitrator(),
      this.gtcrInstance.arbitratorExtraData(),
      this.gtcrInstance.submissionBaseDeposit(),
    ])

    const arbitrator = new ethers.Contract(
      arbitratorAddress,
      _arbitratorABI,
      this.provider,
    )
    const arbitrationCost = await arbitrator.arbitrationCost(
      arbitratorExtraData,
    )

    return submissionBaseDeposit.add(arbitrationCost)
  }

  /**
   * Get the total amount of ETH (in wei) required to challenge a submission.
   *
   * @returns {Promise<BigNumber>} The ETH deposit required to challenge a submission.
   */
  public async getSubmissionChallengeDeposit(): Promise<BigNumber> {
    const [
      arbitratorAddress,
      arbitratorExtraData,
      submissionChallengeBaseDeposit,
    ] = await Promise.all([
      this.gtcrInstance.arbitrator(),
      this.gtcrInstance.arbitratorExtraData(),
      this.gtcrInstance.submissionChallengeBaseDeposit(),
    ])

    const arbitrator = new ethers.Contract(
      arbitratorAddress,
      _arbitratorABI,
      this.provider,
    )
    const arbitrationCost = await arbitrator.arbitrationCost(
      arbitratorExtraData,
    )

    return submissionChallengeBaseDeposit.add(arbitrationCost)
  }
}
