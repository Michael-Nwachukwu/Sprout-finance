'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CheckCircle, Loader2, AlertCircle, FileText, Shield } from 'lucide-react'
import { IDKitRequestWidget, deviceLegacy } from '@worldcoin/idkit'
import type { IDKitResult } from '@worldcoin/idkit'
import type { LegalAssignmentDocument, WorldIdProofData } from '@/lib/legal/template'
import { formatCurrency } from '@/lib/invoicefi/utils'

interface WorldIDSignerProps {
  legalAssignment: LegalAssignmentDocument
  onSigned: (proof: WorldIdProofData, document: LegalAssignmentDocument) => void
}

type SigningState = 'unsigned' | 'signing' | 'verifying' | 'signed' | 'error'

export function WorldIDSigner({ legalAssignment, onSigned }: WorldIDSignerProps) {
  const [state, setState] = useState<SigningState>('unsigned')
  const [error, setError] = useState<string | null>(null)
  const [isWidgetOpen, setIsWidgetOpen] = useState(false)
  const [rpContext, setRpContext] = useState<{
    rp_id: string
    nonce: string
    created_at: number
    expires_at: number
    signature: string
  } | null>(null)

  const appId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID as `app_${string}` | undefined
  const action = process.env.NEXT_PUBLIC_WORLD_ID_ACTION || 'submit-claim'

  const handleSign = useCallback(async () => {
    setState('signing')
    setError(null)

    try {
      // Fetch signed rp_context from server (keeps signing key secret)
      const res = await fetch('/api/world-id/rp-context', { method: 'POST' })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to get RP context')
      }
      const { rp_context } = await res.json()

      setRpContext(rp_context)
      setIsWidgetOpen(true)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Failed to initialize signing')
    }
  }, [])

  const handleVerify = useCallback(
    (result: IDKitResult) => {
      try {
        // Extract proof data directly from IDKit result — skip server-side verification for now
        const response = result.responses[0]
        if (!response) {
          throw new Error('No proof response received')
        }

        const resp = response as Record<string, unknown>
        const proofData: WorldIdProofData = {
          nullifier: (resp.nullifier as string) || (resp.nullifier_hash as string) || '',
          merkle_root: (resp.merkle_root as string) || '',
          proof: (resp.proof as string) || '',
          verification_level: (resp.identifier as string) || (resp.credential_type as string) || 'device',
          action: action || '',
          verified_at: new Date().toISOString(),
        }

        // Attach proof to legal assignment
        const signedDocument: LegalAssignmentDocument = {
          ...legalAssignment,
          worldIdProof: proofData,
        }

        setState('signed')
        onSigned(proofData, signedDocument)
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : 'Failed to extract proof')
      }
    },
    [legalAssignment, onSigned, action]
  )

  const handleSuccess = useCallback(
    (result: IDKitResult) => {
      setIsWidgetOpen(false)
      handleVerify(result)
    },
    [handleVerify]
  )

  if (!appId) {
    return (
      <Card className="border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <p className="text-sm text-amber-800">World ID not configured. Set NEXT_PUBLIC_WORLD_ID_APP_ID in .env.local</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground block mb-1">
            Legal Assignment <span className="text-destructive">*</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Sign a digital legal assignment using World ID for identity verification and KYC.
          </p>
        </div>

        {state === 'signed' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">Signed</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* View Document button */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              View Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Legal Assignment Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-muted-foreground">Invoice ID</div>
                <div className="font-medium">{legalAssignment.invoice.qbInvoiceId}</div>
                <div className="text-muted-foreground">Debtor</div>
                <div className="font-medium">{legalAssignment.invoice.debtorName}</div>
                <div className="text-muted-foreground">Face Value</div>
                <div className="font-medium">{formatCurrency(legalAssignment.invoice.faceValueUSD)}</div>
                <div className="text-muted-foreground">Currency</div>
                <div className="font-medium">{legalAssignment.invoice.originalCurrency}</div>
                <div className="text-muted-foreground">Due Date</div>
                <div className="font-medium">{new Date(legalAssignment.invoice.dueDate).toLocaleDateString()}</div>
                <div className="text-muted-foreground">Borrower</div>
                <div className="font-mono text-[10px]">{legalAssignment.borrowerAddress}</div>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold mb-2">Assignment Clause</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {legalAssignment.assignmentClause}
                </p>
              </div>
              {legalAssignment.worldIdProof && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold mb-2 text-green-700">World ID Signature</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-muted-foreground">Nullifier</div>
                    <div className="font-mono text-[10px] break-all">{legalAssignment.worldIdProof.nullifier}</div>
                    <div className="text-muted-foreground">Merkle Root</div>
                    <div className="font-mono text-[10px] break-all">{legalAssignment.worldIdProof.merkle_root}</div>
                    <div className="text-muted-foreground">Proof</div>
                    <div className="font-mono text-[10px] break-all max-h-20 overflow-y-auto">{legalAssignment.worldIdProof.proof}</div>
                    <div className="text-muted-foreground">Verification Level</div>
                    <div className="font-medium">{legalAssignment.worldIdProof.verification_level}</div>
                    <div className="text-muted-foreground">Action</div>
                    <div className="font-medium">{legalAssignment.worldIdProof.action}</div>
                    <div className="text-muted-foreground">Signed At</div>
                    <div className="font-medium">{new Date(legalAssignment.worldIdProof.verified_at).toLocaleString()}</div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Sign with World ID button */}
        {state !== 'signed' && (
          <Button
            onClick={handleSign}
            size="sm"
            className="text-xs"
            disabled={state === 'signing' || state === 'verifying'}
          >
            {state === 'signing' ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Initializing...</>
            ) : state === 'verifying' ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Verifying...</>
            ) : (
              <><Shield className="w-3.5 h-3.5 mr-1.5" />Sign with World ID</>
            )}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={handleSign} className="text-xs h-6 px-2 ml-auto">
            Retry
          </Button>
        </div>
      )}

      {/* IDKit Widget */}
      {rpContext && (
        <IDKitRequestWidget
          app_id={appId}
          action={action}
          rp_context={rpContext}
          preset={deviceLegacy()}
          allow_legacy_proofs={true}
          environment="staging"
          open={isWidgetOpen}
          onOpenChange={setIsWidgetOpen}
          onSuccess={handleSuccess}
          onError={(errorCode) => {
            setState('error')
            setError(`World ID error: ${errorCode}`)
            setIsWidgetOpen(false)
          }}
        />
      )}
    </div>
  )
}
