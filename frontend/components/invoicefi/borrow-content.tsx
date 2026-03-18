'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useActiveTokenIds, useGetLoan, useDepositCollateral } from '@/lib/hooks/useLendingPool'
import { useGetInvoice, useApproveNFT } from '@/lib/hooks/useInvoiceNFT'
import { formatDate, daysUntil } from '@/lib/invoicefi/utils'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan, parseInvoice } from '@/lib/contracts/parsers'
import Link from 'next/link'
import { ArrowRight, Plus, Loader2, Upload } from 'lucide-react'
import { RiskTierBadge } from './risk-tier-badge'
import { DaysToMaturityPill } from './days-to-maturity-pill'
import { CurrencyAmount } from './currency-amount'
import { useAccount, usePublicClient } from 'wagmi'

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

  const amount = Number(loan.totalFunded) / 1e6
  const maxFundable = Number(loan.maxFundable) / 1e6
  const apy = (Number(loan.discountRateBps) / 100).toFixed(1)
  const riskTier = (invoice.riskTier || 3) as 1 | 2 | 3 | 4 | 5
  const dueDate = new Date(Number(invoice.dueDate) * 1000).toISOString().split('T')[0]
  const isAwaitingFunding = !loan.active && loan.totalFunded === 0n

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
        <CurrencyAmount amount={isAwaitingFunding ? maxFundable : amount} size="sm" />
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
          isAwaitingFunding ? 'bg-green-100 text-green-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {loan.defaulted ? 'Defaulted' : loan.active ? 'Active' : isAwaitingFunding ? 'Listed' : 'Funding'}
        </div>
      </td>
    </tr>
  )
}

// ─── Undeposited invoice row (NFT in user wallet, not yet in LendingPool) ────

function UndepositedRow({ tokenId }: { tokenId: bigint }) {
  const { data: invoiceRaw } = useGetInvoice(tokenId)
  const invoice = parseInvoice(invoiceRaw)
  const { approve: approveNFT, isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess } = useApproveNFT()
  const { depositCollateral, isPending: isDepositPending, isConfirming: isDepositConfirming, isSuccess: isDepositSuccess } = useDepositCollateral()

  useEffect(() => {
    if (isApproveSuccess && !isDepositPending && !isDepositConfirming && !isDepositSuccess) {
      depositCollateral(tokenId)
    }
  }, [isApproveSuccess, tokenId, depositCollateral, isDepositPending, isDepositConfirming, isDepositSuccess])

  if (!invoice) return null

  const faceValue = Number(invoice.faceValueUSD) / 1e18
  const riskTier = (invoice.riskTier || 3) as 1 | 2 | 3 | 4 | 5
  const apy = (Number(invoice.discountRateBps) / 100).toFixed(1)
  const isProcessing = isApprovePending || isApproveConfirming || isDepositPending || isDepositConfirming

  if (isDepositSuccess) return null // deposited — will appear in loans table after refetch

  return (
    <tr className="hover:bg-secondary/50 transition-colors">
      <td className="p-3 md:p-4 text-foreground font-medium">#{tokenId.toString()}</td>
      <td className="p-3 md:p-4"><CurrencyAmount amount={faceValue} size="sm" /></td>
      <td className="p-3 md:p-4 text-foreground">{apy}%</td>
      <td className="p-3 md:p-4"><RiskTierBadge riskTier={riskTier} size="sm" /></td>
      <td className="p-3 md:p-4">
        <div className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
          Not Deposited
        </div>
      </td>
      <td className="p-3 md:p-4">
        <Button
          size="sm"
          disabled={isProcessing}
          onClick={() => approveNFT(tokenId, CONTRACTS.LendingPool.address)}
        >
          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
          {isApprovePending ? 'Approve...' : isApproveConfirming ? 'Confirming...' : isDepositPending ? 'Deposit...' : isDepositConfirming ? 'Confirming...' : 'Deposit'}
        </Button>
      </td>
    </tr>
  )
}

// ─── Hook: find NFTs owned by user but not deposited ─────────────────────────

function useUndepositedTokens(userAddress: string | undefined, activeTokenIds: readonly bigint[] | undefined) {
  const publicClient = usePublicClient()
  const [undepositedIds, setUndepositedIds] = useState<bigint[]>([])
  const [isScanning, setIsScanning] = useState(false)

  const scan = useCallback(async () => {
    if (!publicClient || !userAddress) return
    setIsScanning(true)
    const found: bigint[] = []
    const activeSet = new Set((activeTokenIds ?? []).map(id => id.toString()))

    for (let id = 1n; id <= 50n; id++) {
      try {
        const owner = await publicClient.readContract({
          address: CONTRACTS.InvoiceNFT.address,
          abi: CONTRACTS.InvoiceNFT.abi,
          functionName: 'ownerOf',
          args: [id],
        }) as `0x${string}`

        if (owner.toLowerCase() === userAddress.toLowerCase() && !activeSet.has(id.toString())) {
          found.push(id)
        }
      } catch {
        // Token doesn't exist or was burned — stop scanning
        break
      }
    }

    setUndepositedIds(found)
    setIsScanning(false)
  }, [publicClient, userAddress, activeTokenIds])

  useEffect(() => { scan() }, [scan])

  return { undepositedIds, isScanning, rescan: scan }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BorrowContent({ isHomepage = false }: BorrowContentProps) {
  const { address, isConnected } = useAccount()
  const { data: activeTokenIdsRaw, isLoading } = useActiveTokenIds()
  const activeTokenIds = activeTokenIdsRaw as bigint[] | undefined
  const { undepositedIds, isScanning } = useUndepositedTokens(address, activeTokenIds)

  const myLoanCount = !isLoading && activeTokenIds && address
    ? activeTokenIds.length
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

          {/* Undeposited Invoices */}
          {!isScanning && undepositedIds.length > 0 && (
            <Card className="bg-card border-border overflow-hidden border-orange-200">
              <div className="p-4 md:p-5 border-b border-border bg-orange-50">
                <h3 className="text-lg font-semibold text-foreground">Undeposited Invoices</h3>
                <p className="text-xs text-muted-foreground mt-1">These invoices are minted but not yet listed for funding. Deposit to make them available to lenders.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/50">
                    <tr>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Token ID</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Face Value</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">APY</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Risk</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {undepositedIds.map(id => (
                      <UndepositedRow key={id.toString()} tokenId={id} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

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
