'use client'

import { CheckCircle, AlertCircle } from 'lucide-react'

interface OracleStatusBannerProps {
  status: 'verified' | 'pending' | 'failed'
  message?: string
}

export function OracleStatusBanner({ status, message }: OracleStatusBannerProps) {
  const statusConfig = {
    verified: {
      icon: CheckCircle,
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      label: 'Price Feed Verified',
    },
    pending: {
      icon: AlertCircle,
      bg: 'bg-yellow-50 border-yellow-200',
      text: 'text-yellow-800',
      label: 'Awaiting Price Feed',
    },
    failed: {
      icon: AlertCircle,
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      label: 'Price Feed Error',
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className={`${config.bg} border rounded-lg p-3 flex items-center gap-2`}>
      <Icon className={`w-4 h-4 ${config.text}`} />
      <div className="flex-1">
        <p className={`text-xs font-medium ${config.text}`}>{config.label}</p>
        {message && <p className={`text-xs ${config.text} opacity-75`}>{message}</p>}
      </div>
      <span className="text-xs font-medium text-muted-foreground">via Acurast</span>
    </div>
  )
}
