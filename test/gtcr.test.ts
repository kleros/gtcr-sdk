/* eslint-disable no-unused-expressions */

import ganache from 'ganache-cli'
import { ethers } from 'ethers'
import { gtcrEncode } from '@kleros/gtcr-encoder'
import IPFS from 'ipfs'
import { abi as gtcrABI } from '@kleros/tcr/build/contracts/GeneralizedTCR.json'
import {
  abi as factoryABI,
  bytecode as factoryCode,
} from '@kleros/tcr/build/contracts/GTCRFactory.json'
import {
  abi as arbitratorABI,
  bytecode as arbitratorCode,
} from '@kleros/tcr/build/contracts/EnhancedAppealableArbitrator.json'
import {
  abi as gtcrViewABI,
  bytecode as gtcrViewCode,
} from '@kleros/tcr/build/contracts/GeneralizedTCRView.json'

import { GeneralizedTCR } from '../src'

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

describe('GTCRFactory', () => {
  let signer: ethers.providers.JsonRpcSigner
  let arbitratorInstance: ethers.Contract
  let gtcrFactoryInstance: ethers.Contract
  let gtcrViewInstance: ethers.Contract
  let gtcrInstance: ethers.Contract
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

    // We use a view contract to return more data with fewer calls.
    const gtcrViewFactory = new ethers.ContractFactory(
      new ethers.utils.Interface(gtcrViewABI),
      gtcrViewCode,
      signer,
    )
    gtcrViewInstance = await gtcrViewFactory.deploy()

    // Note that this is not the factory of Generalized TCRs, but
    // an ethers object used to deploy contracts.
    const gtcrFactoryFactory = new ethers.ContractFactory(
      new ethers.utils.Interface(factoryABI),
      factoryCode,
      signer,
    )

    // Deploy the factory.
    gtcrFactoryInstance = await gtcrFactoryFactory.deploy()

    // Deploy a TCR.
    // To deploy a TCR, we first need to produce a meta evidence file.
    // This meta evidence file is then uploaded somewhere (usually ipfs) and
    // its URI stored on event logs on the blockchain.
    // For more information on meta evidence in general, see the ERC-792.
    //
    // In a Generalized TCR contract, items are stored as a byte array.
    // To decode and encode the data, we need information on each column
    // type. This information is included in a "metadata" field in
    // the meta evidence file.
    //
    // So the in the next steps will do all that. Phew.

    const node = await IPFS.create()
    const columns = [
      {
        label: 'Thumbnail',
        type: 'image',
      },
      {
        label: 'Title',
        type: 'text',
      },
      {
        label: 'Link',
        type: 'text',
      },
      {
        label: 'Author',
        type: 'text',
      },
    ]
    const filesAdded = await node.add({
      path: 'meta-evidence.son',
      content: {
        metadata: {
          columns,
        },
      },
    })

    const metaEvidenceURI = `/ipfs/${filesAdded[0].hash}/${filesAdded[0].path}`

    await gtcrFactoryInstance.deploy(
      arbitratorInstance.address,
      arbitratorExtraData,
      signer.getAddress(), // This could be anything for this test.
      metaEvidenceURI,
      metaEvidenceURI,
      signer.getAddress(),
      submissionBaseDeposit,
      removalBaseDeposit,
      submissionChallengeBaseDeposit,
      removalChallengeBaseDeposit,
      challengePeriodDuration,
      [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
    )

    gtcrInstance = new ethers.Contract(
      await gtcrFactoryInstance.instances(0),
      gtcrABI,
      signer,
    )

    const inputValues = {
      Thumbnail:
        '/ipfs/QmbfE4m4esbQ8gSYi83ptpRZggENaHhCWYTr6796Y1iRrk/high-impact-logo-.png',
      Title: 'asd',
      Link:
        'http://localhost:3000/tcr/0x691C328745E4E090c80f4534f646684b418D1F6F',
      Author: '0xdeadbeef',
    }

    const encodedValues = gtcrEncode({ columns, values: inputValues })
    await gtcrInstance.addItem(encodedValues, {
      value: submissionBaseDeposit + arbitrationCost,
    })
  })

  it('Fetches an item from the list correctly', async () => {
    const itemID = await gtcrInstance.itemList(0)
    const gtcr = new GeneralizedTCR(
      externalProvider,
      gtcrInstance.address,
      gtcrViewInstance.address,
    )

    const item = await gtcr.getItem(itemID)

    // TODO: check that class returns expected output.
    console.info(item)
  })
})
