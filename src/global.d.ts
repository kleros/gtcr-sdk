declare module 'ganache-cli'
declare module 'ipfs'

interface MetaEvidence {
  title: string
  description: string
  rulingOptions: {
    titles: string[]
    descriptions: string[]
  }
  category: string
  question: string
  fileURI: string
  evidenceDisplayInterfaceURI: string
  metadata: {
    tcrTitle: string
    tcrDescription: string
    columns: [
      {
        label: string
        description: string
        type: string
        isIdentifier: boolean
      },
    ]
    itemName: string
    itemNamePlural: string
    logoURI: string
    requireRemovalEvidence: true
    isTCRofTCRs: false
    relTcrDisabled: true
  }
}

interface Item {
  ID: string
  data: string
  status: number
  disputed: false
  resolved: false
  disputeID: BigNumber
  appealCost: BigNumber
  appealed: false
  appealStart: BigNumber
  appealEnd: BigNumber
  ruling: number
  requester: string
  challenger: string
  arbitrator: string
  arbitratorExtraData: string
  currentRuling: number
  hasPaid: boolean[]
  feeRewards: BigNumber
  submissionTime: BigNumber
  amountPaid: BigNumber[]
  disputeStatus: number
  numberOfRequests: BigNumber
  decodedData: unknown[]
}
