'use client'

import { useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate, daysUntil } from '@/lib/invoicefi/utils'
import { CurrencyAmount } from './currency-amount'
import { RiskTierBadge } from './risk-tier-badge'
import { FundingProgressBar } from './funding-progress-bar'
import { DaysToMaturityPill } from './days-to-maturity-pill'
import { TransactionModal } from './transaction-modal'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useGetLoan } from '@/lib/hooks/useLendingPool'
import { useFundInvoice } from '@/lib/hooks/useLendingPool'
import { useGetInvoice } from '@/lib/hooks/useInvoiceNFT'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'
import { parseLoan, parseInvoice } from '@/lib/contracts/parsers'
import type { RiskTier } from '@/lib/invoicefi/types'
import { parseUnits } from 'viem'

// Minimal ERC20 approve ABI
const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

interface InvoiceFundProps {
  invoiceId: string // tokenId as string
}

export function InvoiceFund({ invoiceId }: InvoiceFundProps) {
  const tokenId = BigInt(invoiceId)
  const { address } = useAccount()
  const [fundAmount, setFundAmount] = useState(5000)

  const { data: loanData, isLoading: isLoadingLoan, refetch: refetchLoan } = useGetLoan(tokenId)
  const { data: invoiceData, isLoading: isLoadingInvoice } = useGetInvoice(tokenId)
  const { fundInvoice, isPending: isFundPending, isConfirming: isFundConfirming, isSuccess: isFundSuccess, error: fundError, hash } = useFundInvoice()
  const [showModal, setShowModal] = useState(false)
  const [approvePhase, setApprovePhase] = useState<'idle' | 'approving' | 'approved'>('idle')

  // USDC approval
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract()
  const approveFiredRef = useRef(false)

  // After approve tx hash, wait 15s then trigger fundInvoice
  useEffect(() => {
    if (!approveHash || approveFiredRef.current) return
    approveFiredRef.current = true
    setApprovePhase('approving')

    const timer = setTimeout(() => {
      setApprovePhase('approved')
    }, 15_000)

    return () => clearTimeout(timer)
  }, [approveHash])

  // Once approved, auto-call fundInvoice
  const fundTriggeredRef = useRef(false)
  useEffect(() => {
    if (approvePhase === 'approved' && !fundTriggeredRef.current) {
      fundTriggeredRef.current = true
      fundInvoice(tokenId, parseUnits(fundAmount.toString(), 6))
    }
  }, [approvePhase, tokenId, fundAmount, fundInvoice])

  // Show modal when any tx state is active
  useEffect(() => {
    if (isFundPending || isFundConfirming || isFundSuccess || fundError || isApprovePending || approvePhase === 'approving') {
      setShowModal(true)
    }
  }, [isFundPending, isFundConfirming, isFundSuccess, fundError, isApprovePending, approvePhase])

  // Refetch loan data after fund success
  useEffect(() => {
    if (isFundSuccess) {
      const timer = setTimeout(() => refetchLoan(), 5000)
      return () => clearTimeout(timer)
    }
  }, [isFundSuccess, refetchLoan])

  // Check USDC allowance
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.LendingPool.address] : undefined,
    query: { enabled: !!address && CONTRACTS.USDC.address !== 'TO_BE_FILLED_ON_DEPLOY' },
  })

  // Contracts not deployed yet — show placeholder
  const isContractDeployed = CONTRACTS.InvoiceNFT.address !== 'TO_BE_FILLED_ON_DEPLOY'

  if (!isContractDeployed) {
    return <PlaceholderFund invoiceId={invoiceId} />
  }

  if (isLoadingLoan || isLoadingInvoice) {
    return (
      <div className="flex justify-center items-center p-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const loan = parseLoan(loanData)
  const invoice = parseInvoice(invoiceData)

  if (!loan || !invoice || !loan.borrower || loan.borrower === '0x0000000000000000000000000000000000000000') {
    return <div className="p-8 text-center text-muted-foreground">Invoice not found or not listed for funding.</div>
  }

  const maxFundableDisplay = Number(loan.maxFundable) / 1e6
  const totalFundedDisplay = Number(loan.totalFunded) / 1e6
  const fundingPercentage = maxFundableDisplay > 0 ? (totalFundedDisplay / maxFundableDisplay) * 100 : 0
  const remainingDisplay = maxFundableDisplay - totalFundedDisplay
  const daysToMaturity = Number(loan.dueDate) > 0 ? daysUntil(new Date(Number(loan.dueDate) * 1000)) : 0
  const apy = Number(loan.discountRateBps) / 100
  const estimatedYield = (fundAmount * apy * daysToMaturity) / (100 * 365)
  const fundAmountUSDC = parseUnits(fundAmount.toString(), 6)

  const needsApproval = allowanceData != null && (allowanceData as bigint) < fundAmountUSDC

  const handleFund = () => {
    if (!address) return
    approveFiredRef.current = false
    fundTriggeredRef.current = false
    setApprovePhase('idle')

    if (needsApproval) {
      // Step 1: approve USDC, then auto-fund after 15s
      writeApprove({
        address: CONTRACTS.USDC.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.LendingPool.address, fundAmountUSDC],
        gas: 100_000n,
        gasPrice: 1_000_000_000_000n,
      })
    } else {
      // Already approved, fund directly
      fundInvoice(tokenId, fundAmountUSDC)
    }
  }

  const isProcessing = isApprovePending || approvePhase === 'approving' || isFundPending || isFundConfirming
  const txStatus: 'pending' | 'success' | 'failed' | null = isFundSuccess ? 'success' : isProcessing ? 'pending' : fundError ? 'failed' : null
  const modalMessage = isApprovePending ? 'Approving USDC spending in wallet...'
    : approvePhase === 'approving' ? 'Confirming USDC approval...'
    : isFundPending ? 'Confirm funding in wallet...'
    : isFundConfirming ? 'Processing investment on-chain...'
    : isFundSuccess ? `You have successfully funded $${fundAmount.toLocaleString()} of this invoice`
    : fundError ? 'The transaction failed. Please try again.'
    : ''

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header Card */}
      <Card className="bg-primary text-primary-foreground p-6 border-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm opacity-90 mb-1">Invoice Amount</p>
            <p className="text-3xl font-bold">
              <CurrencyAmount amount={Number(invoice.faceValueUSD) / 1e18} size="lg" className="text-primary-foreground" />
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90 mb-1">Max Fundable (USDC)</p>
            <div className="space-y-2">
              <p className="font-semibold">{formatCurrency(maxFundableDisplay)}</p>
              <DaysToMaturityPill
                days={daysToMaturity}
                dueDate={new Date(Number(loan.dueDate) * 1000)}
                size="md"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Invoice Details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">APY</p>
          <p className="text-2xl font-bold text-foreground">{apy.toFixed(2)}%</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Risk Tier</p>
          <div className="mt-2">
            <RiskTierBadge riskTier={invoice.riskTier as RiskTier} size="md" />
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Maturity</p>
          <p className="text-lg font-bold text-foreground">{daysToMaturity} days</p>
        </Card>
      </div>

      {/* Funding Progress */}
      <Card className="bg-card border-border p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Funding Progress</h3>
        <FundingProgressBar
          funded={totalFundedDisplay}
          target={maxFundableDisplay}
          showLabel={true}
          showPercentage={true}
        />
        <p className="text-xs text-muted-foreground mt-3">
          <CurrencyAmount amount={remainingDisplay} size="sm" /> remaining to reach goal
        </p>
      </Card>

      {/* Funding Form */}
      <Card className="bg-card border-border p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Fund This Invoice</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-2">Investment Amount (USDC)</label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="number"
                min={100}
                max={remainingDisplay}
                value={fundAmount}
                onChange={(e) => setFundAmount(Math.min(Number(e.target.value), remainingDisplay))}
                className="h-10 flex-1"
              />
            </div>
            <div className="flex gap-2">
              {[1000, 2500, 5000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setFundAmount(Math.min(amount, remainingDisplay))}
                  className="px-2 py-1 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  ${(amount / 1000).toFixed(1)}K
                </button>
              ))}
            </div>
          </div>

          {/* Yield Calculation */}
          <div className="bg-secondary/50 p-4 rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Your Investment</p>
                <p className="text-lg font-bold text-foreground">
                  <CurrencyAmount amount={fundAmount} size="sm" />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Estimated Yield</p>
                <p className="text-lg font-bold text-primary">${estimatedYield.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              After {daysToMaturity} days at {apy.toFixed(2)}% APY
            </p>
          </div>

          {needsApproval && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800">
              You need to approve USDC spending before funding. This will require two transactions.
            </div>
          )}

          {fundError && (
            <p className="text-sm text-destructive">{fundError.message}</p>
          )}

          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900">
            <p>
              ✓ Your funds will be locked until maturity<br />
              ✓ Interest paid at maturity (pro-rata)<br />
              ✓ Acurast TEE verifies all invoice data
            </p>
          </div>

          <Button
            onClick={handleFund}
            disabled={fundAmount === 0 || isProcessing || loan.active || loan.defaulted || !address}
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
            ) : loan.active ? (
              'Fully Funded'
            ) : needsApproval ? (
              <>Approve & Fund Invoice <ArrowRight className="w-4 h-4 ml-2" /></>
            ) : (
              <>Fund Invoice <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </Card>

      {showModal && txStatus && (
        <TransactionModal
          isOpen={true}
          status={txStatus}
          txHash={hash ?? approveHash ?? ''}
          message={modalMessage}
          onClose={() => {
            setShowModal(false)
            if (isFundSuccess) {
              refetchLoan()
              refetchAllowance()
            }
          }}
        />
      )}

      <Card className="bg-card border-border p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">Invoice Details</h3>
        <p className="text-xs text-muted-foreground">
          QB Invoice ID: <span className="font-mono">{invoice.qbInvoiceId}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Due: {formatDate(new Date(Number(invoice.dueDate) * 1000))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          IPFS: <span className="font-mono">{invoice.ipfsCID.slice(0, 30)}...</span>
        </p>
      </Card>
    </div>
  )
}

// ─── Placeholder shown until contracts are deployed ──────────────────────────

function PlaceholderFund({ invoiceId }: { invoiceId: string }) {
  const [fundAmount, setFundAmount] = useState(5000)

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 border-amber-200 p-4">
        <p className="text-sm text-amber-800">
          <span className="font-medium">Contracts not yet deployed.</span> Update{' '}
          <span className="font-mono text-xs">deployments/polkadot-testnet.json</span> with the deployed addresses.
        </p>
      </Card>
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Fund Invoice #{invoiceId}</h3>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <Input type="number" value={fundAmount} onChange={(e) => setFundAmount(Number(e.target.value))} className="h-10" />
        </div>
        <Button disabled className="w-full h-10 mt-4 bg-primary text-primary-foreground">
          Fund Invoice (deploy contracts first)
        </Button>
      </Card>
    </div>
  )
}
