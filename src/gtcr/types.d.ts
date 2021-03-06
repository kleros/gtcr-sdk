import { BigNumber } from 'ethers'

interface Column {
  label: string
  description: string
  type: string
  isIdentifier: boolean
}

interface Metadata {
  tcrTitle: string
  tcrDescription: string
  columns: Column[]
  itemName: string
  itemNamePlural: string
  logoURI: string
  requireRemovalEvidence: boolean
  isTCRofTCRs: boolean
  relTcrDisabled: boolean
}

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
  metadata: Metadata
}

interface Item {
  ID: string
  data: string
  status: number
  disputed: false // Please note that the `disputed` field is not about whether the item is currently disputed or not, but rather if the latest request was ever disputed (i.e. if there was a dispute, and the final ruling was to accept the request, the item will have status 'Accepted' and disputed will still be `true`.
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
  challengeRemainingTime: number
}

interface QueryOptions {
  oldestFirst?: boolean
  account?: string
  page?: number
  itemsPerPage?: number
  itemsPerRequest?: number
  filter?: boolean[]
  limit?: number
}

interface QueryResult {
  hasMore: boolean
  results: Item[]
}
