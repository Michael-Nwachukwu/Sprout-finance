import { formatCurrency } from '@/lib/invoicefi/utils'

interface CurrencyAmountProps {
  amount: number
  showCents?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function CurrencyAmount({
  amount,
  showCents = false,
  size = 'md',
  className = '',
}: CurrencyAmountProps) {
  const formatted = formatCurrency(amount)

  const sizeClass = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-bold',
  }[size]

  return <span className={`${sizeClass} font-semibold text-foreground ${className}`}>{formatted}</span>
}
