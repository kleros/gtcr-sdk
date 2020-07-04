/* eslint-disable no-unused-expressions */

import ganache from 'ganache-cli'
import { ethers } from 'ethers'
import {
  abi as factoryABI,
  bytecode as factoryCode,
} from '@kleros/tcr/build/contracts/GTCRFactory.json'
import {
  abi as arbitratorABI,
  bytecode as arbitratorCode,
} from '@kleros/tcr/build/contracts/EnhancedAppealableArbitrator.json'

import { GTCRFactory } from '../src'
import { expect } from 'chai'

// Arbitrator and List Parameters
const arbitratorExtraData = '0x85'
const arbitrationCost = 1000

const appealTimeOut = 180
const submissionBaseDeposit = 2000
const removalBaseDeposit = 1300
const submissionChallengeBaseDeposit = 5000
const removalChallengeBaseDeposit = 1200
const challengePeriodDuration = 600
const sharedStakeMultiplier = 5000
const winnerStakeMultiplier = 2000
const loserStakeMultiplier = 8000
const registrationMetaEvidence = 'registrationMetaEvidence.json'
const clearingMetaEvidence = 'clearingMetaEvidence.json'

describe('GTCRFactory', () => {
  let signer: ethers.providers.JsonRpcSigner
  let arbitratorInstance: ethers.Contract
  let gtcrFactoryInstance: ethers.Contract
  let externalProvider:
    | ethers.providers.ExternalProvider
    | ethers.providers.JsonRpcFetchFunc

  beforeEach(async () => {
    externalProvider = ganache.provider({ locked: false })
    const provider = new ethers.providers.Web3Provider(externalProvider)
    signer = provider.getSigner()
    signer.getAddress()

    // We need an arbitrator.
    const arbitratorFactory = new ethers.ContractFactory(
      new ethers.utils.Interface(arbitratorABI),
      arbitratorCode,
      signer,
    )

    // Deploy arbitrator.
    arbitratorInstance = await arbitratorFactory.deploy(
      arbitrationCost,
      signer.getAddress(),
      arbitratorExtraData,
      appealTimeOut,
    )
    await arbitratorInstance.changeArbitrator(arbitratorInstance.address)
    await arbitratorInstance.createDispute(3, arbitratorExtraData, {
      value: arbitrationCost,
    }) // Create a dispute so the index in tests will not be a default value.

    // Note that this is not the factory of Generalized TCRs, but
    // an ethers object used to deploy contracts.
    const gtcrFactoryFactory = new ethers.ContractFactory(
      new ethers.utils.Interface(factoryABI),
      factoryCode,
      signer,
    )

    // Deploy the factory.
    gtcrFactoryInstance = await gtcrFactoryFactory.deploy()
  })

  it('Fetches deployed TCR addresses', async () => {
    // Deploy a few TCRs.
    let i = 0
    const NUM_TCRS = 3
    for (; i < NUM_TCRS; i++)
      await gtcrFactoryInstance.deploy(
        arbitratorInstance.address,
        arbitratorExtraData,
        signer.getAddress(), // This could be anything for this test.
        registrationMetaEvidence,
        clearingMetaEvidence,
        signer.getAddress(),
        submissionBaseDeposit,
        removalBaseDeposit,
        submissionChallengeBaseDeposit,
        removalChallengeBaseDeposit,
        challengePeriodDuration,
        [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
      )

    const gtcrFactory = new GTCRFactory(
      externalProvider,
      gtcrFactoryInstance.address,
    )

    expect(await gtcrFactory.getTCRAddresses())
      .to.be.a.instanceOf(Array)
      .and.of.length(NUM_TCRS)
  })
})
