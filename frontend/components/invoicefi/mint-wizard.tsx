'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CheckCircle, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { CurrencyAmount } from './currency-amount'
import { RiskTierBadge } from './risk-tier-badge'
import { useAccount } from 'wagmi'
import { useRequestMint, usePollFulfillment, useApproveNFT } from '@/lib/hooks/useInvoiceNFT'
import { useDepositCollateral } from '@/lib/hooks/useLendingPool'
import { CONTRACTS } from '@/lib/contracts'
import { hashFile } from '@/lib/ipfs/upload'
import type { MintFormData, MintStep, QBInvoice, OnChainInvoice, RiskTier } from '@/lib/invoicefi/types'
import { formatCurrency, daysUntil } from '@/lib/invoicefi/utils'
import { encodeAbiParameters, keccak256, toHex, parseUnits } from 'viem'

const STEPS: MintStep[] = ['select', 'amount', 'documents', 'submit', 'awaiting', 'review']

const STEP_LABELS: Record<MintStep, string> = {
  connect: 'Connect QB',
  select: 'Select Invoice',
  amount: 'Set Amount',
  documents: 'Documents',
  submit: 'Submit',
  awaiting: 'Awaiting Risk',
  review: 'Confirm',
}

const DISPLAYED_STEPS: MintStep[] = ['select', 'amount', 'documents', 'submit', 'awaiting', 'review']

// Pre-loaded demo invoices for hackathon demo
const DEMO_INVOICES: QBInvoice[] = [
  {
    Id: 'INV-1042',
    DocNumber: 'INV-1042',
    CustomerRef: { name: 'Dangote Industries Ltd', value: 'CUST-001' },
    TotalAmt: 24500,
    DueDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'NGN' },
    Balance: 24500,
  },
  {
    Id: 'INV-1038',
    DocNumber: 'INV-1038',
    CustomerRef: { name: 'SM Prime Holdings Inc', value: 'CUST-002' },
    TotalAmt: 18200,
    DueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 22 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'PHP' },
    Balance: 18200,
  },
  {
    Id: 'INV-1035',
    DocNumber: 'INV-1035',
    CustomerRef: { name: 'Safaricom PLC', value: 'CUST-003' },
    TotalAmt: 31750,
    DueDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'KES' },
    Balance: 31750,
  },
  {
    Id: 'INV-1029',
    DocNumber: 'INV-1029',
    CustomerRef: { name: 'Embraer S.A.', value: 'CUST-004' },
    TotalAmt: 42000,
    DueDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'BRL' },
    Balance: 42000,
  },
]

const EMPTY_FORM: MintFormData = {
  qbInvoice: null,
  financingAmount: 0,
  supportingDocs: [],
  legalAssignment: undefined,
  ipfsCID: '',
  legalAssignmentHash: null,
  pendingTokenId: null,
  discountRateBps: 0,
  riskTier: null,
  maxLtvBps: 0,
}

export function MintWizard() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const [currentStep, setCurrentStep] = useState<MintStep>('select')
  const [formData, setFormData] = useState<MintFormData>(EMPTY_FORM)
  const [qbInvoices] = useState<QBInvoice[]>(DEMO_INVOICES)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isUploadingIPFS, setIsUploadingIPFS] = useState(false)

  const { requestMint, isPending: isMintPending, isConfirming: isMintConfirming, isSuccess: isMintSuccess, pendingTokenId, error: mintError, hash: mintHash } = useRequestMint()
  const { approve: approveNFT, isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess, error: approveError } = useApproveNFT()
  const { depositCollateral, isPending: isDepositPending, isConfirming: isDepositConfirming, isSuccess: isDepositSuccess, error: depositError } = useDepositCollateral()

  // Chain: approve success → auto-trigger depositCollateral (once)
  const depositTriggeredRef = useRef(false)
  useEffect(() => {
    if (isApproveSuccess && formData.pendingTokenId != null && !depositTriggeredRef.current) {
      depositTriggeredRef.current = true
      console.log('[MintWizard] NFT approved, now calling depositCollateral...')
      depositCollateral(formData.pendingTokenId)
    }
  }, [isApproveSuccess, formData.pendingTokenId, depositCollateral])

  const onFulfilled = useCallback((invoice: OnChainInvoice) => {
    setFormData((prev) => ({
      ...prev,
      discountRateBps: invoice.discountRateBps,
      riskTier: invoice.riskTier as RiskTier,
      maxLtvBps: invoice.maxLtvBps,
      financingAmount: prev.financingAmount || Number(invoice.faceValueUSD / 10n ** 18n) * (invoice.maxLtvBps / 10000),
    }))
    setCurrentStep('review')
  }, [])

  usePollFulfillment(formData.pendingTokenId, onFulfilled)

  // Advance to awaiting step when requestMint tx confirms
  useEffect(() => {
    if (isMintSuccess && pendingTokenId != null) {
      setFormData((prev) => ({ ...prev, pendingTokenId }))
      setCurrentStep('awaiting')
    }
  }, [isMintSuccess, pendingTokenId])

  // Redirect to borrow page when deposit confirms
  useEffect(() => {
    if (isDepositSuccess) {
      router.push('/borrow')
    }
  }, [isDepositSuccess, router])

  const stepIndex = STEPS.indexOf(currentStep)

  // ─── Step handlers ──────────────────────────────────────────────────────

  const handleSelectInvoice = (invoice: QBInvoice) => {
    if (!isConnected) return
    setFormData((prev) => ({ ...prev, qbInvoice: invoice }))
    setCurrentStep('amount')
  }

  const handleAmountNext = () => {
    if (formData.financingAmount <= 0) return
    setCurrentStep('documents')
  }

  const handleDocumentsNext = async () => {
    setIsUploadingIPFS(true)
    try {
      const { uploadInvoiceSnapshot, uploadDocument } = await import('@/lib/ipfs/upload')

      // Upload invoice JSON snapshot
      const cid = await uploadInvoiceSnapshot({
        invoice: formData.qbInvoice,
        supportingDocs: formData.supportingDocs.map((f) => f.name),
        timestamp: new Date().toISOString(),
      })

      let legalHash: `0x${string}` = '0x' + '00'.repeat(32)
      if (formData.legalAssignment) {
        legalHash = await hashFile(formData.legalAssignment)
        await uploadDocument(formData.legalAssignment)
      }

      setFormData((prev) => ({ ...prev, ipfsCID: cid, legalAssignmentHash: legalHash }))
      setCurrentStep('submit')
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'IPFS upload failed')
    } finally {
      setIsUploadingIPFS(false)
    }
  }

  const handleSubmitMint = () => {
    if (!address || !formData.qbInvoice || !formData.legalAssignmentHash) return

    const invoice = formData.qbInvoice
    const dueDate = BigInt(Math.floor(new Date(invoice.DueDate).getTime() / 1000))
    const issuedDate = BigInt(Math.floor(new Date(invoice.TxnDate).getTime() / 1000))
    const faceValueUSD = parseUnits(invoice.TotalAmt.toString(), 18)
    const faceValueOriginal = parseUnits(invoice.TotalAmt.toFixed(2), 8)
    const currencyCode = invoice.CurrencyRef.value.slice(0, 3).padEnd(3, '\0')
    const currencyBytes3 = toHex(new TextEncoder().encode(currencyCode).slice(0, 3), { size: 3 })
    const debtorHash = keccak256(
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        [invoice.CustomerRef.name, invoice.CustomerRef.value]
      )
    )
    const invoiceHash = keccak256(
      new TextEncoder().encode(JSON.stringify(formData.qbInvoice)) as unknown as `0x${string}`
    )

    requestMint({
      tokenId: 0n,
      borrower: address,
      invoiceHash,
      faceValueUSD,
      faceValueOriginal,
      originalCurrency: currencyBytes3 as `0x${string}`,
      dueDate,
      issuedDate,
      debtorHash,
      qbInvoiceId: invoice.Id,
      qbRealmId: 'demo-realm',
      discountRateBps: 0,
      riskTier: 0,
      maxLtvBps: 0,
      isCollateralized: false,
      isRepaid: false,
      ipfsCID: formData.ipfsCID,
      legalAssignmentHash: formData.legalAssignmentHash,
    })
  }

  const handleConfirmDeposit = () => {
    if (formData.pendingTokenId == null) return
    depositTriggeredRef.current = false
    console.log('[MintWizard] Starting approve for tokenId:', formData.pendingTokenId.toString())
    approveNFT(formData.pendingTokenId, CONTRACTS.LendingPool.address)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center">
        {DISPLAYED_STEPS.map((step, index) => (
          <div key={step} className="flex items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                stepIndex >= index
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {stepIndex > index ? <CheckCircle className="w-4 h-4" /> : index + 1}
            </div>
            {index < DISPLAYED_STEPS.length - 1 && (
              <div
                className={`flex-1 h-1 mx-1 rounded-full transition-all ${
                  stepIndex > index ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <Card className="bg-card border-border p-6">
        {/* ── Step 1: Select Invoice ── */}
        {currentStep === 'select' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Select Invoice to Finance</h3>
            <p className="text-sm text-muted-foreground">
              Choose an outstanding invoice to tokenize and borrow against.
            </p>
            {!isConnected && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800">Connect your wallet first before selecting an invoice.</p>
              </div>
            )}
            {qbInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open invoices found.</p>
            ) : (
              <div className="space-y-2">
                {qbInvoices.map((inv) => (
                  <button
                    key={inv.Id}
                    onClick={() => handleSelectInvoice(inv)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors hover:bg-secondary ${
                      formData.qbInvoice?.Id === inv.Id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-foreground text-sm">
                          {inv.DocNumber ?? inv.Id}
                        </p>
                        <p className="text-xs text-muted-foreground">{inv.CustomerRef.name}</p>
                      </div>
                      <CurrencyAmount amount={inv.TotalAmt} size="md" />
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-xs text-muted-foreground">
                        Due: {new Date(inv.DueDate).toLocaleDateString()}
                      </p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-xs text-muted-foreground">
                        {daysUntil(new Date(inv.DueDate))} days remaining
                      </p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-xs font-medium text-foreground">
                        {inv.CurrencyRef.value}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Set Amount ── */}
        {currentStep === 'amount' && formData.qbInvoice && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Set Financing Amount</h3>
            <div className="bg-secondary/50 p-3 rounded-lg text-sm space-y-1">
              <p className="text-muted-foreground">
                Invoice: <span className="font-medium text-foreground">{formData.qbInvoice.DocNumber ?? formData.qbInvoice.Id}</span>
              </p>
              <p className="text-muted-foreground">
                Face value: <span className="font-medium text-foreground">{formatCurrency(formData.qbInvoice.TotalAmt)}</span>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Estimated financing amount (USDC)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min={1}
                  max={formData.qbInvoice.TotalAmt * 0.9}
                  value={formData.financingAmount || ''}
                  onChange={(e) => setFormData({ ...formData, financingAmount: Number(e.target.value) })}
                  className="h-10"
                  placeholder="e.g. 12000"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Estimated max: ~{formatCurrency(formData.qbInvoice.TotalAmt * 0.85)} (85% LTV). The exact funding target is set by the Acurast risk engine based on your invoice&apos;s risk profile.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <p className="text-xs text-blue-800">
                <span className="font-medium">How rates work:</span> Your discount rate and final credit limit are calculated by the Acurast risk engine after invoice verification. You will see the exact rate before confirming.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Documents ── */}
        {currentStep === 'documents' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Upload Documents</h3>
            <p className="text-sm text-muted-foreground">
              Supporting documents (purchase orders, bills of lading) improve your risk score and may reduce your discount rate.
            </p>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Supporting documents (optional, ≥2 docs = −50 bps bonus)
              </label>
              <Input
                type="file"
                multiple
                onChange={(e) =>
                  setFormData({ ...formData, supportingDocs: e.target.files ? Array.from(e.target.files) : [] })
                }
                className="h-10"
              />
              {formData.supportingDocs.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formData.supportingDocs.length} file{formData.supportingDocs.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Legal assignment (PDF) <span className="text-destructive">*</span>
              </label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFormData({ ...formData, legalAssignment: e.target.files?.[0] })}
                className="h-10"
              />
              {formData.legalAssignment && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected: {formData.legalAssignment.name}
                </p>
              )}
            </div>
            {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
          </div>
        )}

        {/* ── Step 5: Submit (on-chain requestMint) ── */}
        {currentStep === 'submit' && formData.qbInvoice && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Submit Invoice On-Chain</h3>
            <div className="space-y-2">
              {[
                ['Invoice', formData.qbInvoice.DocNumber ?? formData.qbInvoice.Id],
                ['Amount Requested', formatCurrency(formData.financingAmount)],
                ['IPFS CID', formData.ipfsCID ? `${formData.ipfsCID.slice(0, 20)}...` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-border text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
            {/* Live transaction status */}
            {mintHash && (
              <div className="bg-secondary/50 p-3 rounded-lg text-xs space-y-1">
                <p className="text-muted-foreground">
                  Tx: <span className="font-mono text-foreground">{mintHash.slice(0, 10)}...{mintHash.slice(-8)}</span>
                </p>
                <p className="text-muted-foreground">
                  Status:{' '}
                  <span className="font-medium text-foreground">
                    {isMintConfirming ? 'Waiting for block confirmation...' : isMintSuccess ? 'Confirmed!' : 'Submitted'}
                  </span>
                </p>
                {isMintSuccess && pendingTokenId == null && (
                  <p className="text-amber-600 font-medium">Parsing event logs...</p>
                )}
                {isMintSuccess && pendingTokenId != null && (
                  <p className="text-green-600 font-medium">Token ID: {pendingTokenId.toString()} — advancing...</p>
                )}
              </div>
            )}
            {mintError && (
              <p className="text-sm text-destructive">{mintError.message}</p>
            )}
            <Button
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSubmitMint}
              disabled={isMintPending || isMintConfirming || !isConnected}
            >
              {isMintPending || isMintConfirming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isMintPending ? 'Confirm in wallet...' : 'Confirming...'}
                </>
              ) : isMintSuccess ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
              ) : (
                'Submit Invoice Request'
              )}
            </Button>
          </div>
        )}

        {/* ── Step 6: Awaiting Acurast ── */}
        {currentStep === 'awaiting' && (
          <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Awaiting Risk Assessment</h3>
              <p className="text-sm text-muted-foreground">
                The Acurast TEE is verifying your invoice and calculating your discount rate. This typically takes 30–60 seconds.
              </p>
            </div>
            <div className="bg-secondary/50 p-3 rounded-lg text-xs text-muted-foreground">
              Token ID: <span className="font-mono font-medium">{formData.pendingTokenId?.toString() ?? '—'}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Checking every 10 seconds...
            </div>
          </div>
        )}

        {/* ── Step 7: Review & Confirm (depositCollateral) ── */}
        {currentStep === 'review' && formData.qbInvoice && formData.riskTier && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Review Your Loan Terms</h3>
            <div className="space-y-2">
              {[
                ['Invoice', formData.qbInvoice.DocNumber ?? formData.qbInvoice.Id],
                ['Face Value', formatCurrency(formData.qbInvoice.TotalAmt)],
                ['Funding Target', formatCurrency(formData.qbInvoice.TotalAmt * formData.maxLtvBps / 10000)],
                ['Discount Rate', `${(formData.discountRateBps / 100).toFixed(2)}% APY`],
                ['Max LTV', `${(formData.maxLtvBps / 100).toFixed(0)}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-border text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-b border-border text-sm">
                <span className="text-muted-foreground">Risk Tier</span>
                <RiskTierBadge riskTier={formData.riskTier} size="sm" />
              </div>
            </div>
            <div className="bg-secondary/50 p-3 rounded-lg text-xs text-muted-foreground">
              Confirming will require two transactions: first approve the NFT transfer, then deposit as collateral. Lenders will then fund your invoice.
            </div>
            {(approveError || depositError) && (
              <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-xs text-red-800">
                {approveError?.message || depositError?.message}
              </div>
            )}
            <Button
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConfirmDeposit}
              disabled={isApprovePending || isApproveConfirming || isDepositPending || isDepositConfirming || !isConnected}
            >
              {isApprovePending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approve in wallet...</>
              ) : isApproveConfirming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirming approval...</>
              ) : isDepositPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deposit in wallet...</>
              ) : isDepositConfirming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirming deposit...</>
              ) : (
                'Confirm & List Invoice'
              )}
            </Button>
          </div>
        )}
      </Card>

      {/* Navigation — only show back/next on manual steps */}
      {!['submit', 'awaiting'].includes(currentStep) && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(STEPS[Math.max(0, stepIndex - 1)])}
            disabled={stepIndex === 0 || currentStep === 'review'}
            className="flex-1 h-10"
          >
            Back
          </Button>
          {currentStep !== 'review' && (
            <Button
              onClick={() => {
                if (currentStep === 'select') return
                if (currentStep === 'amount') handleAmountNext()
                else if (currentStep === 'documents') handleDocumentsNext()
              }}
              disabled={
                (currentStep === 'select' && !formData.qbInvoice) ||
                (currentStep === 'amount' && formData.financingAmount <= 0) ||
                (currentStep === 'documents' && isUploadingIPFS)
              }
              className="flex-1 h-10 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isUploadingIPFS ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading to IPFS...</>
              ) : (
                <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
