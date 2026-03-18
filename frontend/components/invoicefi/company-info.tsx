'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Building2, Loader2 } from 'lucide-react'
import { truncateAddress, bytes3ToString, formatCurrency } from '@/lib/invoicefi/utils'
import { useReadContract } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'

interface CompanyInfoProps {
  ipfsCID: string
  borrowerAddress: string
  originalCurrency: string
  faceValueOriginal: bigint
}

interface SnapshotInvoice {
  CustomerRef?: { name: string; value: string }
  DocNumber?: string
  Id?: string
  TotalAmt?: number
  CurrencyRef?: { value: string }
}

export function CompanyInfo({ ipfsCID, borrowerAddress, originalCurrency, faceValueOriginal }: CompanyInfoProps) {
  const [snapshot, setSnapshot] = useState<SnapshotInvoice | null>(null)
  const [loading, setLoading] = useState(true)

  const { data: creditScore } = useReadContract({
    address: CONTRACTS.CreditScoreRegistry.address,
    abi: CONTRACTS.CreditScoreRegistry.abi,
    functionName: 'getScore',
    args: [borrowerAddress as `0x${string}`],
    query: { enabled: !!borrowerAddress },
  })

  useEffect(() => {
    if (!ipfsCID) { setLoading(false); return }
    fetch(`/api/ipfs/${ipfsCID}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.snapshot?.invoice) setSnapshot(data.snapshot.invoice)
        else if (data?.snapshot) setSnapshot(data.snapshot)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ipfsCID])

  const currency = bytes3ToString(originalCurrency)
  const originalAmount = Number(faceValueOriginal) / 1e8

  if (loading) {
    return (
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading company details...</span>
        </div>
      </Card>
    )
  }

  const companyName = snapshot?.CustomerRef?.name
  const invoiceRef = snapshot?.DocNumber ?? snapshot?.Id

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Company & Invoice Details</h3>
      </div>
      <div className="p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Debtor Company</p>
          <p className="font-medium text-foreground">{companyName || 'Undisclosed'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Invoice Reference</p>
          <p className="font-medium text-foreground">{invoiceRef || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Original Amount</p>
          <p className="font-medium text-foreground">
            {originalAmount > 0 ? `${formatCurrency(originalAmount)} ${currency}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Borrower</p>
          <p className="font-mono text-xs text-foreground">{truncateAddress(borrowerAddress)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Borrower Credit Score</p>
          <p className="font-medium text-foreground">
            {creditScore != null ? `${Number(creditScore)}/100` : 'No history'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Currency</p>
          <p className="font-medium text-foreground">{currency || '—'}</p>
        </div>
      </div>
    </Card>
  )
}
