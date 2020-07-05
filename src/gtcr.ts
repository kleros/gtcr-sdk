import { ethers } from 'ethers'
import { abi as _gtcrABI } from '@kleros/tcr/build/contracts/GeneralizedTCR.json'
import { abi as _gtcrViewABI } from '@kleros/tcr/build/contracts/GeneralizedTCRView.json'

import getSweepIntervals from './utils/get-sweep-intervals'
import { gtcrDecode } from '@kleros/gtcr-encoder'

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

  public async getLatestMetaEvidence(): Promise<MetaEvidence[]> {
    const height = await this.provider.getBlockNumber()
    // We fetch events in batches to avoid timeouts by the provider.
    const intervals = getSweepIntervals(
      this.deploymentBlock,
      height,
      this.blocksPerRequest,
    )

    const metaEvidenceURIs = (
      await Promise.all(
        intervals.map(async (interval) =>
          this.gtcrInstance.queryFilter(
            this.gtcrInstance.filters.MetaEvidence(),
            interval.fromBlock,
            interval.toBlock,
          ),
        ),
      )
    )
      .reduce((acc, curr) => [...acc, ...curr])
      .map((e) => this.gtcrInstance.interface.parseLog(e))
      .map((e) => e.args._evidence)

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
}
