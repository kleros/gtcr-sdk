import { ethers } from 'ethers'
import { abi as _gtcrABI } from '@kleros/tcr/build/contracts/GeneralizedTCR.json'
import { abi as _gtcrViewABI } from '@kleros/tcr/build/contracts/GeneralizedTCRView.json'

export default class GeneralizedTCR {
  gtcrInstance: ethers.Contract
  gtcrViewInstance: ethers.Contract
  blocksPerRequest: number
  provider: ethers.providers.JsonRpcProvider
  deploymentBlock: number

  constructor(
    _ethereum:
      | ethers.providers.ExternalProvider
      | ethers.providers.JsonRpcFetchFunc,
    _tcrAddress: string,
    _tcrViewAddress: string,
    _deploymentBlock = 0,
    blockTimeMilliseconds?: number,
  ) {
    this.provider = new ethers.providers.Web3Provider(_ethereum)
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

  public async getItem(_itemID: string): Promise<unknown> {
    // TODO: Fetch meta evidence, and return decoded item.
    return this.gtcrViewInstance.getItem(this.gtcrInstance.address, _itemID)
  }
}
