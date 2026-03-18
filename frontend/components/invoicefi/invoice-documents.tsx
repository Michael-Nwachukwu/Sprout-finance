'use client'

import { Card } from '@/components/ui/card'
import { FileText, ExternalLink } from 'lucide-react'
import { truncateAddress } from '@/lib/invoicefi/utils'

interface InvoiceDocumentsProps {
  ipfsCID: string
  legalAssignmentHash: string
}

export function InvoiceDocuments({ ipfsCID, legalAssignmentHash }: InvoiceDocumentsProps) {
  const hasLegalAssignment =
    legalAssignmentHash && legalAssignmentHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
  // Use local cache API for demo; in production use a real IPFS gateway
  const gatewayUrl = `/api/ipfs/${ipfsCID}`

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Documents</h3>
      </div>
      <div className="p-4 space-y-3">
        {ipfsCID && (
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Invoice Snapshot (IPFS)</p>
              <code className="text-xs text-foreground">{ipfsCID.slice(0, 24)}...</code>
            </div>
            <button
              onClick={() => window.open(gatewayUrl, '_blank')}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}

        {hasLegalAssignment && (
          <div className="p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Legal Assignment Hash</p>
            <code className="text-xs text-foreground">{truncateAddress(legalAssignmentHash)}</code>
          </div>
        )}

        {!ipfsCID && !hasLegalAssignment && (
          <p className="text-sm text-muted-foreground text-center py-2">No documents available</p>
        )}
      </div>
    </Card>
  )
}
