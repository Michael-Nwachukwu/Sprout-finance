'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useActiveTokenIds, useGetLoan } from '@/lib/hooks/useLendingPool'
import { useGetInvoice } from '@/lib/hooks/useInvoiceNFT'
import { formatCurrency } from '@/lib/invoicefi/utils'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan, parseInvoice } from '@/lib/contracts/parsers'
import Link from 'next/link'
import { Search, Loader2 } from 'lucide-react'
import { RiskTierBadge } from './risk-tier-badge'
import { FundingProgressBar } from './funding-progress-bar'
import { CurrencyAmount } from './currency-amount'

const contractsDeployed = CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY'

// ─── Single card for one active token ID ─────────────────────────────────────

function InvoiceCard({ tokenId }: { tokenId: bigint }) {
  const { data: loanRaw } = useGetLoan(tokenId)
  const { data: invoiceRaw } = useGetInvoice(tokenId)

  const loan = parseLoan(loanRaw)
  const invoice = parseInvoice(invoiceRaw)

  if (!loan || !invoice) {
    return (
      <Card className="bg-card border-border p-4 md:p-5 h-full flex items-center justify-center min-h-[180px]">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  // Skip fully-active (disbursed) loans in the marketplace
  if (loan.active) return null

  const maxFundable = Number(loan.maxFundable) / 1e6
  const totalFunded = Number(loan.totalFunded) / 1e6
  const remaining = maxFundable - totalFunded
  const apy = (Number(loan.discountRateBps) / 100).toFixed(1)
  const dueDate = Number(invoice.dueDate)
  const daysToMaturity = Math.max(0, Math.round((dueDate * 1000 - Date.now()) / 86_400_000))
  const riskTier = invoice.riskTier as 1 | 2 | 3 | 4 | 5

  return (
    <Link href={`/lend/invoice/${tokenId.toString()}`}>
      <Card className="bg-card border-border p-4 md:p-5 hover:shadow-lg hover:border-primary/20 transition-all cursor-pointer h-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="font-semibold text-foreground text-sm">Invoice #{tokenId.toString()}</h4>
            <p className="text-xs text-muted-foreground">{invoice.qbInvoiceId}</p>
          </div>
          <RiskTierBadge riskTier={riskTier} size="sm" />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-muted-foreground">Funding Goal</span>
            <div className="text-right">
              <p className="font-bold text-foreground">
                <CurrencyAmount amount={maxFundable} size="md" />
              </p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totalFunded)} funded</p>
            </div>
          </div>

          <FundingProgressBar funded={totalFunded} target={maxFundable} showLabel={false} showPercentage={true} />

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-muted-foreground text-[10px]">APY</p>
              <p className="font-bold text-foreground">{apy}%</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-muted-foreground text-[10px]">Duration</p>
              <p className="font-bold text-foreground">{daysToMaturity}d</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-muted-foreground text-[10px]">Remaining</p>
              <p className="font-bold text-primary">
                ${remaining >= 1000 ? `${(remaining / 1000).toFixed(0)}K` : remaining.toFixed(0)}
              </p>
            </div>
          </div>

          <Button className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
            Fund Invoice
          </Button>
        </div>
      </Card>
    </Link>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LendContent() {
  const [searchTerm, setSearchTerm] = useState('')
  const { data: activeTokenIds, isLoading } = useActiveTokenIds()

  if (!contractsDeployed) {
    return (
      <Card className="bg-amber-50 border-amber-200 p-6 text-center">
        <p className="text-amber-800 font-medium text-sm">Contracts not yet deployed to Polkadot Hub Testnet.</p>
        <p className="text-amber-700 text-xs mt-1">Deploy contracts and update deployments/polkadot-testnet.json to see live invoices.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Active Listings</p>
          <p className="text-2xl font-bold text-foreground">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (activeTokenIds?.length ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">invoices available</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Network</p>
          <p className="text-sm font-bold text-foreground">Westend Hub</p>
          <p className="text-xs text-muted-foreground mt-2">Polkadot Hub EVM testnet</p>
        </Card>
        <Card className="p-4 bg-primary text-primary-foreground">
          <p className="text-xs opacity-90 mb-2">Protocol</p>
          <p className="text-sm font-bold">Sprout Finance</p>
          <p className="text-xs opacity-75 mt-2">Invoice financing DeFi</p>
        </Card>
      </div>

      <Card className="bg-card border-border p-4 md:p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by token ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!activeTokenIds || activeTokenIds.length === 0) && (
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-muted-foreground">No invoices listed for funding yet.</p>
        </Card>
      )}

      {!isLoading && activeTokenIds && activeTokenIds.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          {activeTokenIds
            .filter(id => searchTerm === '' || id.toString().includes(searchTerm))
            .map(tokenId => (
              <InvoiceCard key={tokenId.toString()} tokenId={tokenId} />
            ))}
        </div>
      )}
    </div>
  )
}
