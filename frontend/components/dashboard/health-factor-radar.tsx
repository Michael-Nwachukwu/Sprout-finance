'use client'

import { Card } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useActiveTokenIds } from '@/lib/hooks/useLendingPool'
import { useAccount } from 'wagmi'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { Activity } from 'lucide-react'

const chartConfig = {
  health: {
    label: 'Health factor',
    color: 'hsl(var(--primary))',
  },
}

export function HealthFactorRadar() {
  const { isConnected } = useAccount()
  const { data: tokenIds } = useActiveTokenIds()

  const ids = (tokenIds as bigint[]) ?? []

  const data = ids.map((id) => ({
    name: `#${id.toString()}`,
    health: 85,
  }))

  return (
    <Card className="bg-card border-border p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Portfolio Health</h3>
          <p className="text-xs text-muted-foreground">
            Radar view of health factors across your active loans.
          </p>
        </div>
      </div>

      {!isConnected || data.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center">
          <Activity className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            {isConnected ? 'No active loans to display.' : 'Connect wallet to view health.'}
          </p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-64">
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Radar
              dataKey="health"
              stroke="var(--color-health)"
              fill="var(--color-health)"
              fillOpacity={0.3}
            />
          </RadarChart>
        </ChartContainer>
      )}
    </Card>
  )
}
