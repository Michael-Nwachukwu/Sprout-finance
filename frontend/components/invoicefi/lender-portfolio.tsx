'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveTokenIds } from '@/lib/hooks/useLendingPool'
import { useAccount } from 'wagmi'
import { TrendingUp, Download, Wallet } from 'lucide-react'
import Link from 'next/link'

export function LenderPortfolio() {
  const { isConnected } = useAccount()
  const { data: tokenIds } = useActiveTokenIds()

  const ids = (tokenIds as bigint[]) ?? []

  if (!isConnected) {
    return (
      <div className="space-y-4 md:space-y-5">
        <Card className="p-8 text-center bg-card border-border">
          <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground mb-1">Connect Your Wallet</p>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to view your lending portfolio.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Active Investments</p>
          <p className="text-2xl font-bold text-foreground">{ids.length}</p>
          <p className="text-xs text-muted-foreground mt-2">On-chain positions</p>
        </Card>

        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Network</p>
          <p className="text-2xl font-bold text-primary">PAS</p>
          <p className="text-xs text-muted-foreground mt-2">Polkadot Hub Testnet</p>
        </Card>

        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2">Status</p>
          <p className="text-2xl font-bold text-foreground">Active</p>
          <p className="text-xs text-muted-foreground mt-2">All systems operational</p>
        </Card>

        <Card className="p-4 bg-primary text-primary-foreground">
          <p className="text-xs opacity-90 mb-2">Portfolio Health</p>
          <p className="text-2xl font-bold">{ids.length > 0 ? 'Good' : 'N/A'}</p>
          <p className="text-xs opacity-75 mt-2">{ids.length > 0 ? 'All investments active' : 'No investments yet'}</p>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Link href="/lend" className="flex-1">
          <Button className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
            Browse Invoices
          </Button>
        </Link>
        <Button variant="outline" className="flex-1 h-10" disabled>
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Investments */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="p-4 md:p-5 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Your Investments</h3>
        </div>

        {ids.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr>
                  <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Token ID</th>
                  <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="text-left p-3 md:p-4 font-medium text-muted-foreground text-xs">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ids.map((tokenId) => (
                  <tr key={tokenId.toString()} className="hover:bg-secondary/50 transition-colors">
                    <td className="p-3 md:p-4 text-foreground font-medium">#{tokenId.toString()}</td>
                    <td className="p-3 md:p-4">
                      <div className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        Active
                      </div>
                    </td>
                    <td className="p-3 md:p-4">
                      <Link href={`/lend/invoice/${tokenId.toString()}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground">No investments yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              <Link href="/lend" className="text-primary hover:underline">Browse invoices</Link> to start lending.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
