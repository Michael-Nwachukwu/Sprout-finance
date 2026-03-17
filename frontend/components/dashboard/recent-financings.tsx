'use client'

import { Card } from '@/components/ui/card'
import { useAccount } from 'wagmi'
import { useActiveTokenIds } from '@/lib/hooks/useLendingPool'
import { TrendingUp } from 'lucide-react'
import Link from 'next/link'

export function RecentFinancings() {
  const { isConnected } = useAccount()
  const { data: tokenIds } = useActiveTokenIds()

  const ids = (tokenIds as bigint[]) ?? []

  return (
    <Card className="bg-card border-border p-4 md:p-5 h-full">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Recent financings</h3>
        <p className="text-xs text-muted-foreground">
          Latest funding activity across your invoices.
        </p>
      </div>

      {!isConnected ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view activity.</p>
        </div>
      ) : ids.length === 0 ? (
        <div className="py-8 text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No financing activity yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            <Link href="/borrow/mint" className="text-primary hover:underline">Mint an invoice</Link>
            {' '}or{' '}
            <Link href="/lend" className="text-primary hover:underline">fund one</Link>
            {' '}to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ids.slice(0, 5).map((tokenId) => (
            <Link
              key={tokenId.toString()}
              href={`/lend/invoice/${tokenId.toString()}`}
              className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-secondary/40 px-3 py-2.5 hover:bg-secondary/70 transition-colors"
            >
              <div>
                <p className="text-xs font-medium text-foreground">
                  Invoice #{tokenId.toString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Active loan</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-primary">View details</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
