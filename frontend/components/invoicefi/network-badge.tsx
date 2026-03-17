import { getNetworkColor, getNetworkName } from '@/lib/invoicefi/utils'

interface NetworkBadgeProps {
  network: string
  size?: 'sm' | 'md'
}

export function NetworkBadge({ network, size = 'md' }: NetworkBadgeProps) {
  const colorClass = getNetworkColor(network)
  const name = getNetworkName(network)
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return <div className={`${colorClass} rounded-full font-medium ${sizeClass}`}>{name}</div>
}
