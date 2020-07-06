// eslint-disable jsdoc/require-returns-type
interface BlockInterval {
  fromBlock: number
  toBlock: number
}

/**
 * When fetching logs, a provider may timeout a request if it takes too long to finish. To get around this problem, we should split the request in batches. This function returns the block intervals to be used as a filter when fetching logs (the fromBlock and toBlock fields).
 *
 * @typedef BlockInterval
 * @property {number} fromBlock The number of the initial block.
 * @property {number} toBlock The number of the final block.
 *
 * @param {number} fromBlock The block from where to start scanning. This is usually the contract deployment block.
 * @param {number} height The current height of the blockchain (i.e. the number of the latest block).
 * @param {number} blocksPerRequest The number of blocks to scan per request.
 * @returns {BlockInterval[]} An array of block intervals (i.e. an array of objects with a fromBlock and a toBlock fields).
 */
export default function (
  fromBlock: number,
  height: number,
  blocksPerRequest = 1000000,
): BlockInterval[] {
  // Fetching event logs in a single request can (this was happening) cause
  // the provider to timeout the request.
  // To get around this we can split it into multiple, smaller requests.
  const totalBlocks = height - fromBlock
  const numRequests = Math.ceil(totalBlocks / blocksPerRequest)
  const intervals = [{ fromBlock, toBlock: fromBlock + blocksPerRequest }]
  for (let i = 1; i < numRequests; i++) {
    intervals[i] = {
      fromBlock: intervals[i - 1].toBlock + 1,
      toBlock: intervals[i - 1].toBlock + 1 + blocksPerRequest,
    }
  }
  return intervals
}
