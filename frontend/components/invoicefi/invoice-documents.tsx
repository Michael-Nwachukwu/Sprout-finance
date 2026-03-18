'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, ExternalLink, Download, Shield, Loader2, File, Image } from 'lucide-react'
import { truncateAddress } from '@/lib/invoicefi/utils'

interface InvoiceDocumentsProps {
  ipfsCID: string
  legalAssignmentHash: string
}

interface IPFSFile {
  name: string
}

const GATEWAY_URL = 'https://w3s.link/ipfs'

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'json') return <FileText className="w-4 h-4 text-blue-500" />
  if (ext === 'pdf') return <File className="w-4 h-4 text-red-500" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return <Image className="w-4 h-4 text-green-500" />
  return <File className="w-4 h-4 text-muted-foreground" />
}

function getFileLabel(name: string): string {
  if (name === 'snapshot.json') return 'Invoice Snapshot'
  if (name === 'legal-assignment.json') return 'Legal Assignment (World ID Signed)'
  const base = name.replace(/\.[^.]+$/, '')
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function InvoiceDocuments({ ipfsCID, legalAssignmentHash }: InvoiceDocumentsProps) {
  const [files, setFiles] = useState<IPFSFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasLegalAssignment =
    legalAssignmentHash && legalAssignmentHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'

  useEffect(() => {
    if (!ipfsCID) return

    setIsLoading(true)
    setError(null)

    fetch(`/api/ipfs/${ipfsCID}/files`)
      .then(res => res.json())
      .then(data => {
        if (data.files && Array.isArray(data.files)) {
          setFiles(data.files)
        } else if (data.error) {
          setError(data.error)
        }
      })
      .catch(() => setError('Failed to load document list'))
      .finally(() => setIsLoading(false))
  }, [ipfsCID])

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Documents</h3>
        {ipfsCID && (
          <a
            href={`${GATEWAY_URL}/${ipfsCID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            IPFS <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="p-4 space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading documents...</span>
          </div>
        )}

        {!isLoading && files.length > 0 && files.map((file) => (
          <div key={file.name} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary/70 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              {file.name === 'legal-assignment.json' ? (
                <Shield className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                getFileIcon(file.name)
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{getFileLabel(file.name)}</p>
                <p className="text-xs text-muted-foreground">{file.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => window.open(`${GATEWAY_URL}/${ipfsCID}/${file.name}`, '_blank')}
                title="View on IPFS"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                asChild
              >
                <a
                  href={`${GATEWAY_URL}/${ipfsCID}/${file.name}`}
                  download={file.name}
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </Button>
            </div>
          </div>
        ))}

        {/* Fallback if no file listing available */}
        {!isLoading && files.length === 0 && ipfsCID && !error && (
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Invoice Directory (IPFS)</p>
              <code className="text-xs text-foreground">{ipfsCID.slice(0, 32)}...</code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => window.open(`${GATEWAY_URL}/${ipfsCID}`, '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        )}

        {error && (
          <div className="text-xs text-muted-foreground text-center py-2">
            {error} —{' '}
            <a href={`${GATEWAY_URL}/${ipfsCID}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              View on IPFS gateway
            </a>
          </div>
        )}

        {hasLegalAssignment && (
          <div className="p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Legal Assignment Hash (on-chain)</p>
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
