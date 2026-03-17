'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useActiveTokenIds, useGetLoan } from '@/lib/hooks/useLendingPool'
import { useGetInvoice } from '@/lib/hooks/useInvoiceNFT'
import { formatDate, daysUntil } from '@/lib/invoicefi/utils'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan, parseInvoice } from '@/lib/contracts/parsers'
import Link from 'next/link'
import { ArrowRight, Plus, Loader2 } from 'lucide-react'
import { RiskTierBadge } from './risk-tier-badge'
import { DaysToMaturityPill } from './days-to-maturity-pill'
import { CurrencyAmount } from './currency-amount'
import { useAccount } from 'wagmi'

const contractsDeployed = CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY'

interface BorrowContentProps {
  isHomepage?: boolean
}

// ─── Per-row for active loan table ───────────────────────────────────────────

function LoanRow({ tokenId, borrowerAddress }: { tokenId: bigint; borrowerAddress: string }) {
  const { data: loanRaw } = useGetLoan(tokenId)
  const { data: invoiceRaw } = useGetInvoice(tokenId)

  const loan = parseLoan(loanRaw)
  const invoice = parseInvoice(invoiceRaw)

  if (!loan || !invoice) return null

  if (loan.borrower.toLowerCase() !== borrowerAddress.toLowerCase()) return null
  if (!loan.active && loan.totalFunded === 0n) return null // listing not yet funded

  const amount = Number(loan.totalFunded) / 1e6
  const apy = (Number(loan.discountRateBps) / 100).toFixed(1)
  const riskTier = (invoice.riskTier || 3) as 1 | 2 | 3 | 4 | 5
  const dueDate = new Date(Number(invoice.dueDate) * 1000).toISOString().split('T')[0]

  return (
    <tr
      className="hover:bg-secondary/50 transition-colors cursor-pointer"
      onClick={() => { window.location.href = `/borrow/loan/${tokenId.toString()}` }}
    >
      <td className="p-3 md:p-4 text-foreground font-medium">
        <Link
          href={`/borrow/loan/${tokenId.toString()}`}
          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          #{tokenId.toString()}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </td>
      <td className="p-3 md:p-4">
        <CurrencyAmount amount={amount} size="sm" />
      </td>
      <td className="p-3 md:p-4 text-foreground">{apy}%</td>
      <td className="p-3 md:p-4">
        <RiskTierBadge riskTier={riskTier} size="sm" />
      </td>
      <td className="p-3 md:p-4">
        <DaysToMaturityPill days={daysUntil(dueDate)} dueDate={dueDate} size="sm" />
      </td>
      <td className="p-3 md:p-4">
        <div className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
          loan.defaulted ? 'bg-red-100 text-red-800' :
          loan.active ? 'bg-blue-100 text-blue-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {loan.defaulted ? 'Defaulted' : loan.active ? 'Active' : 'Funding'}
        </div>
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BorrowContent({ isHomepage = false }: BorrowContentProps) {
  const { address, isConnected } = useAccount()
  const { data: activeTokenIds, isLoading } = useActiveTokenIds()

  const myLoanCount = !isLoading && activeTokenIds && address
    ? activeTokenIds.length // actual filtering happens in LoanRow; count is an approximation
    : 0

  if (!contractsDeployed) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Link href="/borrow/mint" className="flex-1">
            <Button className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Finance New Invoice
            </Button>
          </Link>
        </div>
        <Card className="bg-amber-50 border-amber-200 p-6 text-center">
          <p className="text-amber-800 font-medium text-sm">Contracts not yet deployed to Polkadot Hub Testnet.</p>
          <p className="text-amber-700 text-xs mt-1">Deploy contracts and update deployments/polkadot-testnet.json to see live loans.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Active Listings</p>
          <p className="text-2xl font-bold text-foreground">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : myLoanCount}
          </p>
          <p className="text-xs text-muted-foreground mt-2">on Westend Hub</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Wallet</p>
          <p className="text-sm font-mono font-bold text-foreground truncate">
            {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">MetaMask</p>
        </Card>
        <Card className="p-4 bg-primary text-primary-foreground">
          <p className="text-xs opacity-90 mb-2">Network</p>
          <p className="text-sm font-bold">Westend Hub</p>
          <p className="text-xs opacity-75 mt-2">Polkadot Hub EVM testnet</p>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Link href="/borrow/mint" className="flex-1">
          <Button className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Finance New Invoice
          </Button>
        </Link>
      </div>

      {!isHomepage && (
        <>
          {/* Active Loans Table */}
          <Card className="bg-card border-border overflow-hidden">
            <div className="p-4 md:p-5 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Your Loans</h3>
            </div>

            {isLoading && (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && (!activeTokenIds || activeTokenIds.length === 0) && (
              <div className="p-8 text-center">
                <p className="text-muted-foreground">No active loans yet. Finance your first invoice!</p>
              </div>
            )}

            {!isLoading && activeTokenIds && activeTokenIds.length > 0 && address && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/50">
                    <tr>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Token ID</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Amount</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">APY</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Risk</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Due</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeTokenIds.map(tokenId => (
                      <LoanRow key={tokenId.toString()} tokenId={tokenId} borrowerAddress={address} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Info Card */}
          <Card className="bg-blue-50 border-blue-200 p-4 md:p-5">
            <p className="text-sm text-blue-900">
              <span className="font-medium">Tip:</span> Finance invoices to get immediate cash flow while your customers pay on their terms.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
