import { getRiskTierColor, getRiskTierLabel } from '@/lib/invoicefi/utils'
import type { RiskTier } from '@/lib/invoicefi/types'

interface RiskTierBadgeProps {
  riskTier: RiskTier
  size?: 'sm' | 'md'
}

export function RiskTierBadge({ riskTier, size = 'md' }: RiskTierBadgeProps) {
  const colorClass = getRiskTierColor(riskTier)
  const label = getRiskTierLabel(riskTier)

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <div className={`${colorClass} border rounded-full font-medium ${sizeClass}`}>
      {label}
    </div>
  )
}
