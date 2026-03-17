'use client'

import { useReadContract } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'

/**
 * Fetch the current FX rate for a currency from FXOracle.sol.
 * Returns rate with 8 decimal places (divide by 1e8 for display).
 * Will be undefined if the oracle data is stale (contract reverts).
 */
export function useGetRate(currency: string) {
  const currencyBytes3 = stringToBytes3(currency)

  return useReadContract({
    address: CONTRACTS.FXOracle.address,
    abi: CONTRACTS.FXOracle.abi,
    functionName: 'getRate',
    args: [currencyBytes3],
    query: {
      enabled: !!currency && CONTRACTS.FXOracle.address !== 'TO_BE_FILLED_ON_DEPLOY',
      refetchInterval: 60_000, // re-fetch every minute
    },
  })
}

/** Convert a 3-char currency string to bytes3 hex */
function stringToBytes3(s: string): `0x${string}` {
  const bytes = Array.from(s.slice(0, 3)).map((c) =>
    c.charCodeAt(0).toString(16).padStart(2, '0')
  )
  return `0x${bytes.join('').padEnd(6, '0')}` as `0x${string}`
}
