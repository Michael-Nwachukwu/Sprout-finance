// Sprout Finance — Shared TypeScript types
// On-chain types match the Solidity structs in InvoiceNFT.sol and LendingPool.sol

// ─── On-chain types (match Solidity structs) ────────────────────────────────

/** Matches InvoiceNFT.InvoiceData struct */
export interface OnChainInvoice {
  tokenId: bigint
  borrower: `0x${string}`
  invoiceHash: `0x${string}`
  faceValueUSD: bigint       // 18 decimals
  faceValueOriginal: bigint  // 8 decimals
  originalCurrency: string   // bytes3 ISO 4217 e.g. "NGN"
  dueDate: bigint            // Unix timestamp
  issuedDate: bigint         // Unix timestamp
  debtorHash: `0x${string}`
  qbInvoiceId: string
  qbRealmId: string
  discountRateBps: number    // 50–1500, set by Acurast (0 = not yet fulfilled)
  riskTier: number           // 1–5, set by Acurast (0 = not yet fulfilled)
  maxLtvBps: number          // e.g. 8500 = 85%
  isCollateralized: boolean
  isRepaid: boolean
  ipfsCID: string
  legalAssignmentHash: `0x${string}`
  requestedAmount: bigint       // 18 decimals — user's desired financing amount in USD
}

/** Matches LendingPool.Loan struct */
export interface OnChainLoan {
  tokenId: bigint
  borrower: `0x${string}`
  totalFunded: bigint
  maxFundable: bigint
  discountRateBps: bigint
  openedAt: bigint
  dueDate: bigint
  active: boolean
  defaulted: boolean
  positionCount: bigint
}

/** Matches LendingPool.LoanPosition struct */
export interface OnChainLoanPosition {
  lender: `0x${string}`
  principal: bigint
  sharesBps: bigint
  repaid: boolean
}

// ─── Numeric risk tier (1–5) ────────────────────────────────────────────────

export type RiskTier = 1 | 2 | 3 | 4 | 5

// ─── Display types (UI-facing, derived from on-chain data) ──────────────────

export type LoanStatus = 'active' | 'repaid' | 'defaulted' | 'pending' | 'awaiting_risk'
export type InvoiceStatus = 'available' | 'funded' | 'processing' | 'closed'
export type Network = 'polkadot-testnet' | 'westend-hub'

/** UI representation of an invoice (derived from OnChainInvoice + OnChainLoan) */
export interface Invoice {
  id: string              // tokenId as string
  borrowerId: string
  borrowerName: string
  borrowerLogo?: string
  amount: number          // faceValueUSD converted to display (USD)
  issuedDate: Date
  dueDate: Date
  daysToMaturity: number
  riskTier: RiskTier
  discountRateBps: number
  fundedAmount: number    // USDC funded so far (6 decimals → display)
  targetAmount: number    // maxFundable (6 decimals → display)
  apy: number             // discountRateBps / 100 (display %)
  fundingPercentage: number
  network: Network
  invoiceNumber: string   // qbInvoiceId
  description: string
  status: InvoiceStatus
  ipfsCID: string
  originalCurrency: string
}

/** UI representation of a borrower's loan */
export interface Loan {
  id: string
  invoiceId: string       // tokenId as string
  borrowerId: string
  amount: number          // maxFundable in display USD
  principalAmount: number
  status: LoanStatus
  initiatedDate: Date
  maturityDate: Date
  totalRepaid: number
  apy: number
  riskTier: RiskTier
  discountRateBps: number
  network: Network
  repaymentSchedule: RepaymentScheduleItem[]
}

export interface RepaymentScheduleItem {
  dueDate: Date
  amount: number
  paid: boolean
  paidDate?: Date
}

export interface UserProfile {
  id: string
  name: string
  email: string
  avatar?: string
  role: 'borrower' | 'lender' | 'both'
  borrowerCapacity?: number
  lenderBalance?: number
  network: Network
  walletAddress: `0x${string}`
}

export interface Portfolio {
  totalLoans: number
  activeLoanAmount: number
  totalRepaid: number
  totalInvoicesFunded: number
  activeInvestmentAmount: number
  totalYieldsEarned: number
  nextPaymentDate?: Date
  portfolioApy: number
}

export interface InvoiceSlice {
  invoiceId: string
  amount: number
  apy: number
  daysToMaturity: number
  fundedBy: `0x${string}`
  fundingDate: Date
}

export interface LenderInvestment {
  invoiceId: string
  tokenId: bigint
  investmentAmount: number
  apy: number
  status: 'active' | 'completed' | 'defaulted'
  investedDate: Date
  maturityDate: Date
  estimatedYield: number
  actualYield?: number
}

// ─── QuickBooks types ────────────────────────────────────────────────────────

export interface QBInvoice {
  Id: string
  TxnDate: string
  DueDate: string
  TotalAmt: number
  Balance: number
  CurrencyRef: { value: string; name: string }
  CustomerRef: { value: string; name: string }
  Line: unknown[]
  DocNumber?: string
}

export interface QBInvoiceListResponse {
  invoices: QBInvoice[]
  realmId: string
}

// ─── MintWizard form state ───────────────────────────────────────────────────

export type MintStep =
  | 'connect'
  | 'select'
  | 'amount'
  | 'documents'
  | 'ai-review'
  | 'submit'
  | 'awaiting'
  | 'review'

// ─── AI Analysis types ──────────────────────────────────────────────────────

export interface AIAnalysisResult {
  authenticity: {
    score: number
    flags: string[]
    summary: string
  }
  crossReference: {
    matched: boolean
    discrepancies: string[]
    summary: string
  }
  companyDueDiligence: {
    companyName: string
    industry: string
    riskFactors: string[]
    publicInfo: string
    summary: string
  }
  fraudIndicators: {
    riskLevel: 'low' | 'medium' | 'high'
    flags: string[]
    summary: string
  }
  overallSummary: string
  recommendation: 'proceed' | 'caution' | 'reject'
}

// ─── MintWizard form state ───────────────────────────────────────────────────

export interface MintFormData {
  qbInvoice: QBInvoice | null
  financingAmount: number
  supportingDocs: File[]
  legalAssignment: File | undefined
  ipfsCID: string
  legalAssignmentHash: `0x${string}` | null
  pendingTokenId: bigint | null
  // Filled after Acurast fulfills:
  discountRateBps: number
  riskTier: RiskTier | null
  maxLtvBps: number
}
