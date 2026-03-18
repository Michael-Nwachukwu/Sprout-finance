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
import type { MintFormData, MintStep, QBInvoice, OnChainInvoice, RiskTier, AIAnalysisResult } from '@/lib/invoicefi/types'
import { formatCurrency, daysUntil } from '@/lib/invoicefi/utils'
import { encodeAbiParameters, keccak256, toHex, parseUnits } from 'viem'

const STEPS: MintStep[] = ['select', 'amount', 'documents', 'ai-review', 'submit', 'awaiting', 'review']

const STEP_LABELS: Record<MintStep, string> = {
  connect: 'Connect QB',
  select: 'Select Invoice',
  amount: 'Set Amount',
  documents: 'Documents',
  'ai-review': 'AI Review',
  submit: 'Submit',
  awaiting: 'Awaiting Risk',
  review: 'Confirm',
}

const DISPLAYED_STEPS: MintStep[] = ['select', 'amount', 'documents', 'ai-review', 'submit', 'awaiting', 'review']

// Pre-loaded demo invoices for hackathon demo
const DEMO_INVOICES: QBInvoice[] = [
  {
    Id: 'INV-1042',
    DocNumber: 'INV-1042',
    CustomerRef: { name: 'Dangote Industries Ltd', value: 'CUST-001' },
    TotalAmt: 24500,
    DueDate: new Date(Date.now() + 75 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'NGN', name: 'Nigerian Naira' },
    Balance: 24500,
    Line: [
      { Description: 'Premium Grade A Cocoa Beans (50kg bags)', Qty: 200, UnitPrice: 85000, Amount: 17000000 },
      { Description: 'Shea Butter - Refined (25L drums)', Qty: 150, UnitPrice: 45000, Amount: 6750000 },
      { Description: 'Freight & Handling (Tema Port → Apapa Port)', Qty: 1, UnitPrice: 750000, Amount: 750000 },
    ],
  },
  {
    Id: 'INV-1038',
    DocNumber: 'INV-1038',
    CustomerRef: { name: 'SM Prime Holdings Inc', value: 'CUST-002' },
    TotalAmt: 18200,
    DueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 22 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'PHP', name: 'Philippine Peso' },
    Balance: 18200,
    Line: [
      { Description: 'Structural Steel Beams (H-beam 200x200)', Qty: 120, UnitPrice: 8500, Amount: 1020000 },
      { Description: 'Reinforced Concrete Panels (3m x 1.5m)', Qty: 80, UnitPrice: 3200, Amount: 256000 },
    ],
  },
  {
    Id: 'INV-1035',
    DocNumber: 'INV-1035',
    CustomerRef: { name: 'Safaricom PLC', value: 'CUST-003' },
    TotalAmt: 31750,
    DueDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'KES', name: 'Kenyan Shilling' },
    Balance: 31750,
    Line: [
      { Description: 'M-PESA Agent Network SIM Hardware Kits (100-unit packs)', Qty: 350, UnitPrice: 5200, Amount: 1820000 },
      { Description: 'Branded Point-of-Sale Display Stands', Qty: 500, UnitPrice: 2700, Amount: 1350000 },
      { Description: 'Logistics & Last-Mile Delivery (Nairobi, Mombasa, Kisumu)', Qty: 1, UnitPrice: 455000, Amount: 455000 },
    ],
  },
  {
    Id: 'INV-1029',
    DocNumber: 'INV-1029',
    CustomerRef: { name: 'Embraer S.A.', value: 'CUST-004' },
    TotalAmt: 42000,
    DueDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    TxnDate: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    CurrencyRef: { value: 'BRL', name: 'Brazilian Real' },
    Balance: 42000,
    Line: [
      { Description: 'Avionics Wiring Harness Assembly (ERJ-145)', Qty: 24, UnitPrice: 12500, Amount: 300000 },
      { Description: 'Hydraulic Actuator Rebuild Kits', Qty: 60, UnitPrice: 3800, Amount: 228000 },
    ],
  },
]

// ─── Awaiting Risk sub-component with retry timer ────────────────────────────

function AwaitingRiskStep({ tokenId, onRetry, riskError }: { tokenId: bigint | null; onRetry: () => void; riskError: string | null }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const showRetry = elapsed > 120 || riskError != null

  return (
    <div className="space-y-6 text-center py-4">
      {!riskError && (
        <div className="flex justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}
      {riskError && (
        <div className="flex justify-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {riskError ? 'Risk Assessment Failed' : 'Awaiting Risk Assessment'}
        </h3>
        {riskError ? (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-left">
            <p className="text-sm text-red-800">{riskError}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The risk engine is verifying your invoice and calculating your discount rate. This typically takes 30–60 seconds.
          </p>
        )}
      </div>
      <div className="bg-secondary/50 p-3 rounded-lg text-xs text-muted-foreground">
        Token ID: <span className="font-mono font-medium">{tokenId?.toString() ?? '—'}</span>
      </div>
      {!riskError && (
        <div className="text-xs text-muted-foreground">
          Checking every 10 seconds... ({elapsed}s elapsed)
        </div>
      )}
      {showRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Retry Risk Assessment
        </Button>
      )}
    </div>
  )
}

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
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [riskError, setRiskError] = useState<string | null>(null)

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

  // Advance to awaiting step when requestMint tx confirms, and trigger risk engine
  const riskEngineTriggeredRef = useRef(false)
  const triggerRiskEngine = useCallback(async (tokenId: bigint) => {
    setRiskError(null)
    try {
      const res = await fetch('/api/risk-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: tokenId.toString() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(data.error || `Risk engine returned ${res.status}`)
      }
      const data = await res.json()
      if (data.status === 'already_fulfilled') {
        console.log('[MintWizard] Risk already fulfilled for token', tokenId.toString())
      } else {
        console.log('[MintWizard] Risk engine submitted:', data.txHash)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Risk engine call failed'
      console.error('[MintWizard] risk-engine trigger failed:', message)
      setRiskError(message)
    }
  }, [])

  useEffect(() => {
    if (isMintSuccess && pendingTokenId != null) {
      setFormData((prev) => ({ ...prev, pendingTokenId }))
      setCurrentStep('awaiting')
      if (!riskEngineTriggeredRef.current) {
        riskEngineTriggeredRef.current = true
        triggerRiskEngine(pendingTokenId)
      }
      // Cache AI analysis result so lenders can view it
      if (aiAnalysis) {
        fetch('/api/ai/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: pendingTokenId.toString(), result: aiAnalysis }),
        }).catch((err) => console.warn('[MintWizard] Failed to cache AI analysis:', err))
      }
    }
  }, [isMintSuccess, pendingTokenId, triggerRiskEngine, aiAnalysis])

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
    setFetchError(null)
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
      setIsUploadingIPFS(false)

      // Only advance AFTER all uploads succeed
      setCurrentStep('ai-review')
      triggerAIAnalysis()
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'IPFS upload failed')
      setIsUploadingIPFS(false)
      // Do NOT advance step — stay on documents page and show error
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip data URL prefix (e.g. "data:application/pdf;base64,")
        const base64 = result.split(',')[1] || result
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const triggerAIAnalysis = async () => {
    setIsAnalyzing(true)
    setAiError(null)
    setAiAnalysis(null)
    try {
      // Convert uploaded docs to base64 for AI analysis
      const docsForAI: { name: string; type: string; base64: string }[] = []
      for (const file of formData.supportingDocs) {
        const base64 = await fileToBase64(file)
        docsForAI.push({ name: file.name, type: file.type, base64 })
      }

      const inv = formData.qbInvoice
      const invoiceData: Record<string, unknown> = {
        invoiceNumber: inv?.DocNumber ?? inv?.Id,
        debtorName: inv?.CustomerRef?.name,
        sellerName: 'Borrower (see wallet address)',
        faceValueUSD: inv?.TotalAmt,
        originalCurrency: inv?.CurrencyRef?.value,
        currencyName: inv?.CurrencyRef?.name,
        issuedDate: inv?.TxnDate,
        dueDate: inv?.DueDate,
        paymentTerms: `Net ${Math.round((new Date(inv?.DueDate ?? '').getTime() - new Date(inv?.TxnDate ?? '').getTime()) / 86400000)} days`,
        lineItems: inv?.Line?.map((item: unknown) => {
          const line = item as Record<string, unknown>
          return {
            description: line.Description,
            quantity: line.Qty,
            unitPrice: line.UnitPrice,
            amount: line.Amount,
            currency: inv?.CurrencyRef?.value,
          }
        }),
        note: `TotalAmt ($${inv?.TotalAmt?.toLocaleString()}) is the USD-equivalent face value. Line item amounts are in ${inv?.CurrencyRef?.value} (original currency).`,
      }

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceData, supportingDocs: docsForAI }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'AI analysis failed')
      }

      const data = await res.json()
      setAiAnalysis(data.result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed')
    } finally {
      setIsAnalyzing(false)
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
              Upload your trade documents for AI verification and risk scoring. Providing 2+ supporting documents earns a −50 bps discount bonus.
            </p>

            {/* 1. Purchase Order */}
            <div className="border border-border rounded-lg p-3">
              <label className="text-sm font-medium text-foreground block mb-1">
                Purchase Order (PO)
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                The buyer&apos;s purchase order that initiated this invoice.
              </p>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setFormData((prev) => ({
                      ...prev,
                      supportingDocs: [...prev.supportingDocs.filter((f) => !f.name.toLowerCase().includes('po') && !f.name.toLowerCase().includes('purchase')), file],
                    }))
                  }
                }}
                className="h-10"
              />
            </div>

            {/* 2. Bill of Lading */}
            <div className="border border-border rounded-lg p-3">
              <label className="text-sm font-medium text-foreground block mb-1">
                Bill of Lading (BoL)
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Shipping document confirming goods were dispatched/received.
              </p>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setFormData((prev) => ({
                      ...prev,
                      supportingDocs: [...prev.supportingDocs.filter((f) => !f.name.toLowerCase().includes('bol') && !f.name.toLowerCase().includes('lading')), file],
                    }))
                  }
                }}
                className="h-10"
              />
            </div>

            {/* 3. Legal Assignment */}
            <div className="border border-border rounded-lg p-3">
              <label className="text-sm font-medium text-foreground block mb-1">
                Legal Assignment Document <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Signed document assigning the invoice receivable to the lending pool. This is hashed and stored on-chain.
              </p>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setFormData({ ...formData, legalAssignment: e.target.files?.[0] })}
                className="h-10"
              />
              {formData.legalAssignment && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected: {formData.legalAssignment.name}
                </p>
              )}
            </div>

            {formData.supportingDocs.length > 0 && (
              <div className="bg-green-50 border border-green-200 p-2 rounded-lg">
                <p className="text-xs text-green-800">
                  {formData.supportingDocs.length} supporting document{formData.supportingDocs.length > 1 ? 's' : ''} uploaded
                  {formData.supportingDocs.length >= 2 && ' — eligible for −50 bps bonus'}
                </p>
              </div>
            )}

            {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
          </div>
        )}

        {/* ── Step 4.5: AI Review ── */}
        {currentStep === 'ai-review' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">AI Verification</h3>
            <p className="text-sm text-muted-foreground">
              Gemini AI is analyzing your invoice and documents for authenticity, cross-reference consistency, and company due diligence.
            </p>

            {isAnalyzing && (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                <span className="text-sm text-muted-foreground">Running AI analysis...</span>
              </div>
            )}

            {aiError && (
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                  <p className="text-sm text-red-800">{aiError}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={triggerAIAnalysis}>
                    Retry Analysis
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep('submit')}>
                    Skip & Continue
                  </Button>
                </div>
              </div>
            )}

            {aiAnalysis && (
              <div className="space-y-4">
                {/* Recommendation badge */}
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                  aiAnalysis.recommendation === 'proceed' ? 'bg-green-50 border-green-200' :
                  aiAnalysis.recommendation === 'caution' ? 'bg-amber-50 border-amber-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <span className={`text-sm font-semibold ${
                    aiAnalysis.recommendation === 'proceed' ? 'text-green-700' :
                    aiAnalysis.recommendation === 'caution' ? 'text-amber-700' :
                    'text-red-700'
                  }`}>
                    AI Verdict: {aiAnalysis.recommendation.toUpperCase()}
                  </span>
                </div>

                {/* Overall summary */}
                <p className="text-sm text-foreground">{aiAnalysis.overallSummary}</p>

                {/* Score cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Authenticity</p>
                    <p className={`text-sm font-bold ${aiAnalysis.authenticity.score >= 70 ? 'text-green-600' : aiAnalysis.authenticity.score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {aiAnalysis.authenticity.score}/100
                    </p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Cross-Ref</p>
                    <p className={`text-sm font-bold ${aiAnalysis.crossReference.matched ? 'text-green-600' : 'text-red-600'}`}>
                      {aiAnalysis.crossReference.matched ? 'Match' : 'Mismatch'}
                    </p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Fraud Risk</p>
                    <p className={`text-sm font-bold ${aiAnalysis.fraudIndicators.riskLevel === 'low' ? 'text-green-600' : aiAnalysis.fraudIndicators.riskLevel === 'medium' ? 'text-amber-600' : 'text-red-600'}`}>
                      {aiAnalysis.fraudIndicators.riskLevel.charAt(0).toUpperCase() + aiAnalysis.fraudIndicators.riskLevel.slice(1)}
                    </p>
                  </div>
                </div>

                {/* Flags */}
                {(aiAnalysis.fraudIndicators.flags.length > 0 || aiAnalysis.authenticity.flags.length > 0) && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-1">
                    <p className="text-xs font-semibold text-amber-800">Flags:</p>
                    {[...aiAnalysis.authenticity.flags, ...aiAnalysis.fraudIndicators.flags].map((flag, i) => (
                      <p key={i} className="text-xs text-amber-700">- {flag}</p>
                    ))}
                  </div>
                )}

                {/* Company due diligence */}
                {aiAnalysis.companyDueDiligence.companyName !== 'Unknown' && (
                  <div className="bg-secondary/50 p-3 rounded-lg space-y-1">
                    <p className="text-xs font-semibold text-foreground">Company: {aiAnalysis.companyDueDiligence.companyName}</p>
                    <p className="text-xs text-muted-foreground">Industry: {aiAnalysis.companyDueDiligence.industry}</p>
                    <p className="text-xs text-muted-foreground">{aiAnalysis.companyDueDiligence.summary}</p>
                  </div>
                )}

                {aiAnalysis.recommendation === 'reject' && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                    <p className="text-xs text-red-800 font-medium">
                      AI recommends not proceeding. You can still submit, but lenders will see this analysis.
                    </p>
                  </div>
                )}
              </div>
            )}
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

        {/* ── Step 6: Awaiting Risk Engine ── */}
        {currentStep === 'awaiting' && (
          <AwaitingRiskStep
            tokenId={formData.pendingTokenId}
            riskError={riskError}
            onRetry={() => {
              if (formData.pendingTokenId == null) return
              riskEngineTriggeredRef.current = false
              triggerRiskEngine(formData.pendingTokenId)
            }}
          />
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
                else if (currentStep === 'ai-review') setCurrentStep('submit')
              }}
              disabled={
                (currentStep === 'select' && !formData.qbInvoice) ||
                (currentStep === 'amount' && formData.financingAmount <= 0) ||
                (currentStep === 'documents' && isUploadingIPFS) ||
                (currentStep === 'ai-review' && (isAnalyzing || (!aiAnalysis && !aiError)))
              }
              className="flex-1 h-10 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isUploadingIPFS ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading to IPFS...</>
              ) : currentStep === 'ai-review' ? (
                <>Proceed to Submit <ChevronRight className="w-4 h-4 ml-1" /></>
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
