/* eslint-disable no-unused-expressions */

import ganache from 'ganache-cli'
import { ethers } from 'ethers'
import fetchMock from 'fetch-mock'
import { gtcrEncode } from '@kleros/gtcr-encoder'
import { expect } from 'chai'
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

const metaEvidenceGateway = 'https://localhost'
const metaEvidenceURI = `/ipfs/QmbQnE...`
const inputValues = {
  Thumbnail: '/ipfs/Qmbf...E4m4e/thumbnail.png',
  Title: 'Some title',
  Link: 'http://example.com',
  Author: '0xdeadbeef',
}

// This is information available in the metadata field
// of the meta evidence file. It is used to decode
// and encode item data (since it is stored as a byte array)
// on the blockchain.
// For more information on meta evidence, see ERC-792 and ERC-1497.
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

describe('GeneralizedTCR', async () => {
  before(() => {
    fetchMock.mock(
      `${metaEvidenceGateway}${metaEvidenceURI}`,
      {
        metadata: {
          columns,
        },
      },
      {
        delay: 500, // fake a slow network
      },
    )
  })

  after(() => {
    fetchMock.restore()
  })

  let signer: ethers.providers.JsonRpcSigner
  let arbitratorInstance: ethers.Contract
  let gtcrFactoryInstance: ethers.Contract
  let gtcrViewInstance: ethers.Contract
  let gtcrInstance: ethers.Contract
  let gtcr: GeneralizedTCR
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

    const encodedValues = gtcrEncode({ columns, values: inputValues })
    await gtcrInstance.addItem(encodedValues, {
      value: submissionBaseDeposit + arbitrationCost,
    })

    gtcr = new GeneralizedTCR(
      externalProvider,
      gtcrInstance.address,
      gtcrViewInstance.address,
      metaEvidenceGateway,
    )
  })

  it('Fetches an item from the list', async () => {
    const itemID = await gtcrInstance.itemList(0)

    const item = await gtcr.getItem(itemID)
    expect(item.decodedData).to.deep.equal([
      inputValues.Thumbnail,
      inputValues.Title,
      inputValues.Link,
      inputValues.Author,
    ])
  })

  it('Fetches items from the list', async function () {
    this.timeout(10000)

    // Add a few more items
    await Promise.all(
      [...Array(3).keys()]
        .map((i) => ({
          // Items must be unique, modify a bit.
          ...inputValues,
          Title: inputValues.Title + i,
        }))
        .map((values) => gtcrEncode({ columns, values: values }))
        .map((encodedValues) =>
          gtcrInstance.addItem(encodedValues, {
            value: submissionBaseDeposit + arbitrationCost,
          }),
        ),
    )

    const fetchedItems = await gtcr.getItems()
    expect(fetchedItems.length).to.be.equal(4) // 1 item added in beforeEach.
    expect(fetchedItems.map((item) => item.decodedData)).to.deep.equal([
      [
        '/ipfs/Qmbf...E4m4e/thumbnail.png',
        'Some title2',
        'http://example.com',
        '0xdeadbeef',
      ],
      [
        '/ipfs/Qmbf...E4m4e/thumbnail.png',
        'Some title1',
        'http://example.com',
        '0xdeadbeef',
      ],
      [
        '/ipfs/Qmbf...E4m4e/thumbnail.png',
        'Some title0',
        'http://example.com',
        '0xdeadbeef',
      ],
      [
        '/ipfs/Qmbf...E4m4e/thumbnail.png',
        'Some title',
        'http://example.com',
        '0xdeadbeef',
      ],
    ])
  })
})
