import type { RiskTier } from './types'

/**
 * Format currency amount with USD symbol
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Calculate days until date
 */
export function daysUntil(date: Date | string | number): number {
  const now = new Date()
  const d = date instanceof Date ? date : new Date(date)
  const diff = d.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * Get risk tier badge color
 */
export function getRiskTierColor(riskTier: RiskTier): string {
  switch (riskTier) {
    case 1:
      return 'bg-green-100 text-green-800 border-green-200'
    case 2:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 3:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 4:
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 5:
      return 'bg-red-100 text-red-800 border-red-200'
  }
}

/**
 * Get risk tier label
 */
export function getRiskTierLabel(riskTier: RiskTier): string {
  switch (riskTier) {
    case 1:
      return 'Very Low Risk'
    case 2:
      return 'Low Risk'
    case 3:
      return 'Medium Risk'
    case 4:
      return 'High Risk'
    case 5:
      return 'Very High Risk'
  }
}

/**
 * Calculate estimated yield from investment
 */
export function calculateYield(
  principal: number,
  apy: number,
  daysHeld: number,
): number {
  return (principal * apy * daysHeld) / (100 * 365)
}

/**
 * Format date to short format
 */
export function formatDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/**
 * Format date to long format
 */
export function formatDateLong(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/**
 * Get status badge color
 */
export function getStatusColor(
  status: 'active' | 'completed' | 'defaulted' | 'pending' | 'repaid' | 'funded' | 'available' | 'processing' | 'closed',
): string {
  switch (status) {
    case 'active':
    case 'funded':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'completed':
    case 'repaid':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'defaulted':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'pending':
    case 'processing':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'available':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'closed':
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

/**
 * Get network badge color
 */
export function getNetworkColor(network: string): string {
  switch (network) {
    case 'ethereum':
      return 'bg-blue-100 text-blue-800'
    case 'polygon':
      return 'bg-purple-100 text-purple-800'
    case 'arbitrum':
      return 'bg-orange-100 text-orange-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * Get network display name
 */
export function getNetworkName(network: string): string {
  switch (network) {
    case 'ethereum':
      return 'Ethereum'
    case 'polygon':
      return 'Polygon'
    case 'arbitrum':
      return 'Arbitrum'
    default:
      return network
  }
}

/**
 * Decode bytes3 hex to a 3-letter currency string (e.g. "NGN", "PHP")
 */
export function bytes3ToString(bytes3Hex: string): string {
  const hex = bytes3Hex.replace(/^0x/, '').slice(0, 6)
  let str = ''
  for (let i = 0; i < 6; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16)
    if (code > 0) str += String.fromCharCode(code)
  }
  return str
}

/**
 * Truncate wallet address for display
 */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Format large numbers with abbreviations
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toFixed(0)
}
