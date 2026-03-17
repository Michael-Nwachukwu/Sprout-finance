'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { truncateAddress } from '@/lib/invoicefi/utils'

interface TransactionModalProps {
  isOpen: boolean
  status: 'pending' | 'success' | 'failed'
  txHash?: string
  message?: string
  onClose: () => void
}

export function TransactionModal({
  isOpen,
  status,
  txHash,
  message,
  onClose,
}: TransactionModalProps) {
  const [showModal, setShowModal] = useState(isOpen)

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  if (!showModal) return null

  const statusConfig = {
    pending: {
      icon: Clock,
      title: 'Transaction Pending',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    success: {
      icon: CheckCircle,
      title: 'Transaction Successful',
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    failed: {
      icon: AlertCircle,
      title: 'Transaction Failed',
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <div className={`${config.bg} rounded-lg p-4 flex flex-col items-center gap-4 mb-4`}>
          <Icon className={`w-12 h-12 ${config.color}`} />
          <h2 className={`text-lg font-bold ${config.color}`}>{config.title}</h2>
        </div>

        {message && (
          <p className="text-sm text-muted-foreground text-center mb-4">{message}</p>
        )}

        {txHash && (
          <div className="bg-secondary rounded-lg p-3 mb-4 flex items-center justify-between">
            <code className="text-xs text-muted-foreground">{truncateAddress(txHash)}</code>
            <button
              onClick={() => window.open(`https://polkadot.testnet.routescan.io/tx/${txHash}`, '_blank')}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}

        <Button
          onClick={onClose}
          className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {status === 'pending' ? 'Waiting...' : 'Done'}
        </Button>
      </div>
    </div>
  )
}
