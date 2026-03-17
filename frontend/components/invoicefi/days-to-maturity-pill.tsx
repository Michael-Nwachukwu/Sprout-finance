import { Calendar } from 'lucide-react'

interface DaysToMaturityPillProps {
  days: number
  dueDate: Date
  size?: 'sm' | 'md'
}

export function DaysToMaturityPill({ days, dueDate, size = 'md' }: DaysToMaturityPillProps) {
  const getStatusColor = () => {
    if (days < 0) return 'bg-red-100 text-red-800 border-red-200'
    if (days <= 7) return 'bg-orange-100 text-orange-800 border-orange-200'
    if (days <= 30) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-blue-100 text-blue-800 border-blue-200'
  }

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  const daysText = days < 0 ? `Overdue ${Math.abs(days)}d` : days === 0 ? 'Today' : `${days}d`

  return (
    <div className={`${getStatusColor()} border rounded-full font-medium flex items-center gap-1.5 ${sizeClass}`}>
      <Calendar className="w-3 h-3" />
      <span>{daysText}</span>
    </div>
  )
}
