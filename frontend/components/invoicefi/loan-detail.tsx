'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGetLoan, useAmountOwed, useRepay } from '@/lib/hooks/useLendingPool'
import { useGetInvoice } from '@/lib/hooks/useInvoiceNFT'
import { formatDate, daysUntil } from '@/lib/invoicefi/utils'
import { CurrencyAmount } from './currency-amount'
import { RiskTierBadge } from './risk-tier-badge'
import { DaysToMaturityPill } from './days-to-maturity-pill'
import { ArrowRight, Loader2 } from 'lucide-react'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan, parseInvoice } from '@/lib/contracts/parsers'

const contractsDeployed = CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY'

interface LoanDetailProps {
  loanId: string
}

export function LoanDetail({ loanId }: LoanDetailProps) {
  const tokenId = BigInt(loanId)
  const { data: loanRaw, isLoading: loanLoading } = useGetLoan(contractsDeployed ? tokenId : null)
  const { data: invoiceRaw, isLoading: invoiceLoading } = useGetInvoice(contractsDeployed ? tokenId : null)
  const loan = parseLoan(loanRaw)
  const invoice = parseInvoice(invoiceRaw)
  const { data: amountOwed } = useAmountOwed(contractsDeployed ? tokenId : null)
  const { repay, isPending, isConfirming, isSuccess, error } = useRepay()

  if (!contractsDeployed) {
    return (
      <Card className="bg-amber-50 border-amber-200 p-6 text-center">
        <p className="text-amber-800 font-medium text-sm">Contracts not yet deployed to Westend Hub.</p>
      </Card>
    )
  }

  if (loanLoading || invoiceLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!loan || !invoice || loan.borrower === '0x0000000000000000000000000000000000000000') {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Loan not found for token #{loanId}</p>
      </div>
    )
  }

  const amount = Number(loan.totalFunded) / 1e6
  const owed = amountOwed ? Number(amountOwed) / 1e6 : 0
  const apy = (Number(loan.discountRateBps) / 100).toFixed(1)
  const riskTier = invoice.riskTier as 1 | 2 | 3 | 4 | 5
  const dueDateStr = new Date(Number(invoice.dueDate) * 1000).toISOString().split('T')[0]
  const openedAt = new Date(Number(loan.openedAt) * 1000).toISOString().split('T')[0]

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header Card */}
      <Card className="bg-primary text-primary-foreground p-6 border-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm opacity-90 mb-1">Loan Amount</p>
            <p className="text-3xl font-bold">
              <CurrencyAmount amount={amount} size="lg" className="text-primary-foreground" />
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90 mb-1">Maturity Date</p>
            <div className="space-y-2">
              <p className="text-2xl font-bold">{formatDate(dueDateStr)}</p>
              <DaysToMaturityPill days={daysUntil(dueDateStr)} dueDate={dueDateStr} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">APY</p>
          <p className="text-2xl font-bold text-foreground">{apy}%</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Risk Level</p>
          <div className="mt-2">
            <RiskTierBadge riskTier={riskTier} size="md" />
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Status</p>
          <p className={`text-sm font-semibold mt-2 ${
            loan.defaulted ? 'text-red-600' : loan.active ? 'text-green-600' : 'text-yellow-600'
          }`}>
            {loan.defaulted ? 'Defaulted' : loan.active ? 'Active' : 'Awaiting Funding'}
          </p>
        </Card>
      </div>

      {/* Details */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="p-4 md:p-5 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Loan Details</h3>
        </div>
        <div className="p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Token ID</p>
              <p className="font-medium text-foreground">#{loanId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">QB Invoice ID</p>
              <p className="font-medium text-foreground">{invoice.qbInvoiceId || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Opened</p>
              <p className="font-medium text-foreground">{formatDate(openedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Principal</p>
              <p className="font-medium text-foreground">
                <CurrencyAmount amount={amount} size="sm" />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">IPFS CID</p>
              <p className="font-mono text-xs text-foreground truncate">{invoice.ipfsCID || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Max Fundable</p>
              <p className="font-medium text-foreground">
                <CurrencyAmount amount={Number(loan.maxFundable) / 1e6} size="sm" />
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Amount Owed */}
      {loan.active && (
        <Card className="bg-card border-border p-4 md:p-5">
          <p className="text-xs text-muted-foreground mb-2">Amount Owed (principal + interest)</p>
          <p className="text-2xl font-bold text-foreground">
            <CurrencyAmount amount={owed} size="md" />
          </p>
        </Card>
      )}

      {/* Error display */}
      {error && (
        <Card className="bg-red-50 border-red-200 p-4">
          <p className="text-red-700 text-sm">{error.message}</p>
        </Card>
      )}
      {isSuccess && (
        <Card className="bg-green-50 border-green-200 p-4">
          <p className="text-green-700 text-sm">Repayment submitted successfully.</p>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="outline" className="flex-1 h-10" disabled>
          Download Documents
        </Button>
        {loan.active && !loan.defaulted && (
          <Button
            className="flex-1 h-10 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => repay(tokenId)}
            disabled={isPending || isConfirming || isSuccess}
          >
            {isPending ? 'Approving…' : isConfirming ? 'Confirming…' : isSuccess ? 'Repaid!' : 'Make Repayment'}
            {!isPending && !isConfirming && !isSuccess && <ArrowRight className="w-4 h-4 ml-2" />}
          </Button>
        )}
      </div>
    </div>
  )
}
