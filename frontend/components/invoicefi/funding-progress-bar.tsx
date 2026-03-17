import { formatPercentage } from '@/lib/invoicefi/utils'

interface FundingProgressBarProps {
  funded: number
  target: number
  showLabel?: boolean
  showPercentage?: boolean
}

export function FundingProgressBar({
  funded,
  target,
  showLabel = true,
  showPercentage = true,
}: FundingProgressBarProps) {
  const percentage = Math.min((funded / target) * 100, 100)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        {showLabel && (
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>${funded.toLocaleString()}</span>
            <span>/</span>
            <span>${target.toLocaleString()}</span>
          </div>
        )}
        {showPercentage && (
          <span className="text-xs font-medium text-foreground">{formatPercentage(percentage, 0)}</span>
        )}
      </div>
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
