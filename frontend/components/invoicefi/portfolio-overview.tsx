'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveTokenIds, useGetLoan, useGetLoanPositions } from '@/lib/hooks/useLendingPool'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan } from '@/lib/contracts/parsers'
import { CurrencyAmount } from './currency-amount'
import { Link as LinkIcon, ArrowRight, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useAccount } from 'wagmi'

const contractsDeployed = CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY'

// ─── Per-loan borrower summary ────────────────────────────────────────────────

function useBorrowerLoanSummary(tokenId: bigint, borrowerAddress: string) {
  const { data: loanRaw } = useGetLoan(tokenId)
  const loan = parseLoan(loanRaw)
  if (!loan || loan.borrower.toLowerCase() !== borrowerAddress.toLowerCase()) return null
  return loan
}

// ─── Per-loan lender position summary ────────────────────────────────────────

function useLenderPositionSummary(tokenId: bigint, lenderAddress: string) {
  const { data: positions } = useGetLoanPositions(tokenId)
  if (!positions) return { principal: 0n }
  const myPositions = positions.filter(p => p.lender.toLowerCase() === lenderAddress.toLowerCase())
  const principal = myPositions.reduce((sum, p) => sum + p.principal, 0n)
  return { principal }
}

// ─── Connected portfolio ──────────────────────────────────────────────────────

function ConnectedPortfolio({ address }: { address: string }) {
  const { data: activeTokenIds, isLoading } = useActiveTokenIds()

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tokenIds = activeTokenIds ?? []

  return (
    <PortfolioContent tokenIds={tokenIds} address={address} />
  )
}

// ─── Portfolio content (requires token IDs) ───────────────────────────────────

function PortfolioContent({ tokenIds, address }: { tokenIds: readonly bigint[], address: string }) {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Active Listings</p>
          <p className="text-2xl font-bold text-foreground">{tokenIds.length}</p>
          <p className="text-xs text-muted-foreground mt-2">on Westend Hub</p>
        </Card>

        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Wallet</p>
          <p className="text-sm font-mono font-bold text-foreground truncate">{address.slice(0, 6)}…{address.slice(-4)}</p>
          <p className="text-xs text-muted-foreground mt-2">Connected</p>
        </Card>

        <Card className="p-4 bg-primary text-primary-foreground">
          <p className="text-xs opacity-90 mb-2">Protocol</p>
          <p className="text-sm font-bold">Sprout Finance</p>
          <p className="text-xs opacity-75 mt-2">Westend Hub EVM</p>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/borrow">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 p-4 cursor-pointer hover:shadow-lg transition-all">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-blue-900">Borrow</h3>
              <TrendingDown className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-blue-800 mb-4">
              Finance invoices to improve cash flow while maintaining growth.
            </p>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              View Loans
              <ArrowRight className="w-3 h-3 ml-2" />
            </Button>
          </Card>
        </Link>

        <Link href="/lend">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 p-4 cursor-pointer hover:shadow-lg transition-all">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-green-900">Lend</h3>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm text-green-800 mb-4">
              Invest in verified invoices and earn yields on your capital.
            </p>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              Fund Invoices
              <ArrowRight className="w-3 h-3 ml-2" />
            </Button>
          </Card>
        </Link>
      </div>

      {/* Info Card */}
      <Card className="bg-purple-50 border-purple-200 p-4 md:p-5">
        <div className="flex gap-3">
          <LinkIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-purple-900 mb-1">Unified Portfolio</p>
            <p className="text-xs text-purple-800">
              Monitor both your borrowing obligations and lending yields in one place.
              Your positions update in real-time from the Westend Hub blockchain.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

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
