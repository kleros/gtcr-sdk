import { ethers } from 'ethers'
import { abi as _gtcrFactoryABI } from '@kleros/tcr/build/contracts/GTCRFactory.json'

import getSweepIntervals from './utils/get-sweep-intervals'

export class GTCRFactory {
  gtcrFactoryInstance: ethers.Contract
  blocksPerRequest: number
  provider: ethers.providers.JsonRpcProvider
  deploymentBlock: number

  constructor(
    _ethereum:
      | ethers.providers.ExternalProvider
      | ethers.providers.JsonRpcFetchFunc,
    _factoryAddress: string,
    _deploymentBlock = 0,
    blockTimeMilliseconds?: number,
  ) {
    this.provider = new ethers.providers.Web3Provider(_ethereum)
    this.gtcrFactoryInstance = new ethers.Contract(
      _factoryAddress,
      _gtcrFactoryABI,
      this.provider,
    )
    this.deploymentBlock = _deploymentBlock

    const blocksPerMinute = Math.floor(
      60 / (blockTimeMilliseconds || 15000 / 1000),
    )

    this.blocksPerRequest = blocksPerMinute * 60 * 24 * 30 * 4
  }

  public async getTCRAddresses() {
    // Fetch the addresses of TCRs deployed with this factory.
    const height = await this.provider.getBlockNumber()

    // Fetch the addresses of TCRs deployed with this factory and
    // instantiate tcrs.
    // We fetch events in batches to avoid timeouts by the provider.
    const intervals = getSweepIntervals(
      this.deploymentBlock,
      height,
      this.blocksPerRequest,
    )
    const addresses = (
      await Promise.all(
        intervals.map(async (interval) =>
          this.gtcrFactoryInstance.queryFilter(
            this.gtcrFactoryInstance.filters.NewGTCR(),
            interval.fromBlock,
            interval.toBlock,
          ),
        ),
      )
    )
      .reduce((acc, curr) => [...acc, ...curr])
      .map((rawEvent) => this.gtcrFactoryInstance.interface.parseLog(rawEvent))
      .map((event) => event.args._address)

    return addresses
  }
}
