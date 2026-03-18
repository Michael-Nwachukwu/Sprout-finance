'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveTokenIds, useGetLoan, useGetLoanPositions } from '@/lib/hooks/useLendingPool'
import { useGetInvoice } from '@/lib/hooks/useInvoiceNFT'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan, parseInvoice } from '@/lib/contracts/parsers'
import { CurrencyAmount } from './currency-amount'
import { RiskTierBadge } from './risk-tier-badge'
import { DaysToMaturityPill } from './days-to-maturity-pill'
import { daysUntil } from '@/lib/invoicefi/utils'
import { ArrowRight, TrendingDown, TrendingUp, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import type { OnChainLoan, OnChainLoanPosition, RiskTier } from '@/lib/invoicefi/types'

const contractsDeployed = CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY'

// ─── Loan status helper ──────────────────────────────────────────────────────

function getLoanStatusLabel(loan: OnChainLoan): string {
  if (loan.defaulted) return 'Defaulted'
  if (loan.active) return 'Active'
  if (loan.totalFunded < loan.maxFundable) return 'Funding'
  return 'Pending'
}

function getLoanStatusColor(loan: OnChainLoan): string {
  if (loan.defaulted) return 'bg-red-100 text-red-800 border-red-200'
  if (loan.active) return 'bg-green-100 text-green-800 border-green-200'
  return 'bg-yellow-100 text-yellow-800 border-yellow-200'
}

// ─── BorrowerRow — renders one row per token if borrower matches ─────────────

function BorrowerRow({ tokenId, address }: { tokenId: bigint; address: `0x${string}` }) {
  const { data: loanRaw } = useGetLoan(tokenId)
  const { data: invoiceRaw } = useGetInvoice(tokenId)
  const loan = parseLoan(loanRaw)
  const invoice = parseInvoice(invoiceRaw)

  if (!loan || loan.borrower.toLowerCase() !== address.toLowerCase()) return null

  const amountUSDC = Number(loan.totalFunded) / 1e6
  const apy = Number(loan.discountRateBps) / 100
  const dueDate = new Date(Number(loan.dueDate) * 1000)
  const days = daysUntil(dueDate)
  const riskTier = invoice?.riskTier as RiskTier | undefined

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      <td className="py-3 px-4">
        <Link href={`/borrow/loan/${tokenId.toString()}`} className="text-primary hover:underline font-medium">
          #{tokenId.toString()}
        </Link>
      </td>
      <td className="py-3 px-4">
        <CurrencyAmount amount={amountUSDC} size="sm" />
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {apy.toFixed(2)}%
      </td>
      <td className="py-3 px-4">
        <DaysToMaturityPill days={days} dueDate={dueDate} size="sm" />
      </td>
      <td className="py-3 px-4">
        {riskTier && riskTier >= 1 && riskTier <= 5 ? (
          <RiskTierBadge riskTier={riskTier} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${getLoanStatusColor(loan)}`}>
          {getLoanStatusLabel(loan)}
        </span>
      </td>
    </tr>
  )
}

// ─── LenderRow — renders rows per token for matching lender positions ────────

function LenderRow({ tokenId, address }: { tokenId: bigint; address: `0x${string}` }) {
  const { data: loanRaw } = useGetLoan(tokenId)
  const { data: positionsRaw } = useGetLoanPositions(tokenId)
  const loan = parseLoan(loanRaw)

  if (!loan || !positionsRaw) return null

  const positions = positionsRaw as readonly OnChainLoanPosition[]
  const myPositions = positions.filter(
    (p) => p.lender.toLowerCase() === address.toLowerCase()
  )

  if (myPositions.length === 0) return null

  const dueDate = new Date(Number(loan.dueDate) * 1000)
  const days = daysUntil(dueDate)

  return (
    <>
      {myPositions.map((pos, idx) => {
        const principal = Number(pos.principal) / 1e6
        const sharePct = Number(pos.sharesBps) / 100

        return (
          <tr
            key={`${tokenId.toString()}-${idx}`}
            className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
          >
            <td className="py-3 px-4">
              <Link href={`/lend/invoice/${tokenId.toString()}`} className="text-primary hover:underline font-medium">
                #{tokenId.toString()}
              </Link>
            </td>
            <td className="py-3 px-4">
              <CurrencyAmount amount={principal} size="sm" />
            </td>
            <td className="py-3 px-4 text-sm text-muted-foreground">
              {sharePct.toFixed(2)}%
            </td>
            <td className="py-3 px-4">
              <DaysToMaturityPill days={days} dueDate={dueDate} size="sm" />
            </td>
            <td className="py-3 px-4">
              <span
                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${
                  pos.repaid
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : loan.defaulted
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : 'bg-blue-100 text-blue-800 border-blue-200'
                }`}
              >
                {pos.repaid ? 'Repaid' : loan.defaulted ? 'Defaulted' : 'Active'}
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ─── Summary stats ───────────────────────────────────────────────────────────

function SummaryStats({
  tokenIds,
}: {
  tokenIds: readonly bigint[]
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="w-4 h-4 text-blue-500" />
          <p className="text-xs text-muted-foreground">Borrower</p>
        </div>
        <p className="text-sm font-medium text-foreground">View your loans below</p>
        <p className="text-xs text-muted-foreground mt-1">Invoice-backed borrowing</p>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <p className="text-xs text-muted-foreground">Lender</p>
        </div>
        <p className="text-sm font-medium text-foreground">View your investments below</p>
        <p className="text-xs text-muted-foreground mt-1">Fractional invoice funding</p>
      </Card>

      <Card className="p-4 bg-primary text-primary-foreground">
        <p className="text-xs opacity-90 mb-2">Active Listings</p>
        <p className="text-2xl font-bold">{tokenIds.length}</p>
        <p className="text-xs opacity-75 mt-1">on Polkadot Hub Testnet</p>
      </Card>
    </div>
  )
}

// ─── Portfolio content (requires token IDs) ──────────────────────────────────

function PortfolioContent({
  tokenIds,
  address,
}: {
  tokenIds: readonly bigint[]
  address: `0x${string}`
}) {
  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <SummaryStats tokenIds={tokenIds} />

      {/* Borrower Positions */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-foreground">Borrower Positions</h3>
          </div>
          <Link href="/borrow/mint">
            <Button size="sm" variant="outline" className="text-xs">
              New Invoice <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>

        {tokenIds.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">No active loans. Finance your first invoice!</p>
            <Link href="/borrow/mint">
              <Button size="sm">
                Get Started <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Token</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">APY</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Due Date</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Risk</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {tokenIds.map((id) => (
                  <BorrowerRow key={id.toString()} tokenId={id} address={address} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Lender Positions */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-semibold text-foreground">Lender Positions</h3>
          </div>
          <Link href="/lend">
            <Button size="sm" variant="outline" className="text-xs">
              Marketplace <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>

        {tokenIds.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">No investments yet. Browse the marketplace!</p>
            <Link href="/lend">
              <Button size="sm">
                Browse Invoices <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Token</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Principal</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Share</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Due Date</th>
                  <th className="py-2 px-4 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {tokenIds.map((id) => (
                  <LenderRow key={id.toString()} tokenId={id} address={address} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Connected portfolio ─────────────────────────────────────────────────────

function ConnectedPortfolio({ address }: { address: `0x${string}` }) {
  const { data: activeTokenIds, isLoading } = useActiveTokenIds()

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tokenIds = activeTokenIds ?? []

  return <PortfolioContent tokenIds={tokenIds} address={address} />
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function PortfolioOverview() {
  const { address, isConnected } = useAccount()

  if (!contractsDeployed) {
    return (
      <Card className="bg-amber-50 border-amber-200 p-6 text-center">
        <p className="text-amber-800 font-medium text-sm">Contracts not yet deployed to Polkadot Hub Testnet.</p>
        <p className="text-amber-700 text-xs mt-1">Deploy contracts and update deployments/polkadot-testnet.json to enable portfolio tracking.</p>
      </Card>
    )
  }

  if (!isConnected || !address) {
    return (
      <Card className="bg-card border-border p-8 text-center">
        <p className="text-muted-foreground">Connect your wallet to view your portfolio.</p>
      </Card>
    )
  }

  return <ConnectedPortfolio address={address} />
}
