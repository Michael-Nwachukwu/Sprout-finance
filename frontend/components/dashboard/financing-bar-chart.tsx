'use client'

import { Card } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useActiveTokenIds } from '@/lib/hooks/useLendingPool'
import { useAccount } from 'wagmi'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'

const chartConfig = {
  volume: {
    label: 'Funded volume',
    color: 'hsl(var(--primary))',
  },
}

export function FinancingBarChart() {
  const { isConnected } = useAccount()
  const { data: tokenIds } = useActiveTokenIds()

  const ids = (tokenIds as bigint[]) ?? []

  return (
    <Card className="bg-card border-border p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Funding by invoice</h3>
          <p className="text-xs text-muted-foreground">
            Bar chart of how much capital is deployed into each invoice.
          </p>
        </div>
      </div>

      {!isConnected || ids.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            {isConnected ? 'No funded invoices yet.' : 'Connect wallet to view data.'}
          </p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-64">
          <BarChart data={ids.map((id) => ({ label: `#${id.toString()}`, volume: 0 }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="volume"
              fill="var(--color-volume)"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  )
}
