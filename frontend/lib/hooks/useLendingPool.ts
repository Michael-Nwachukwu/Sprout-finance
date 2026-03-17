'use client'

import { useState, useEffect, useRef } from 'react'
import { useWriteContract, useReadContract } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'

// ─── Shared helper: time-based tx confirmation for pallet_revive ─────────────
// pallet_revive's RPC doesn't support useWaitForTransactionReceipt reliably,
// and contract state reads (eth_call) return stale data. So we use a simple
// time-based wait after tx hash is received.

function useWaitAfterTx(hash: `0x${string}` | undefined, delayMs = 15_000) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!hash || firedRef.current) return
    firedRef.current = true
    setIsConfirming(true)

    const timer = setTimeout(() => {
      setIsConfirming(false)
      setIsSuccess(true)
    }, delayMs)

    return () => clearTimeout(timer)
  }, [hash, delayMs])

  const reset = () => {
    firedRef.current = false
    setIsConfirming(false)
    setIsSuccess(false)
  }

  return { isConfirming, isSuccess, reset }
}

// ─── depositCollateral ────────────────────────────────────────────────────────

export function useDepositCollateral() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isConfirming, isSuccess, reset } = useWaitAfterTx(hash)

  const depositCollateral = (tokenId: bigint) => {
    reset()
    writeContract({
      address: CONTRACTS.LendingPool.address,
      abi: CONTRACTS.LendingPool.abi,
      functionName: 'depositCollateral',
      args: [tokenId],
      gas: 300_000n,
      gasPrice: 1_000_000_000_000n,
    })
  }

  return { depositCollateral, isPending, isConfirming, isSuccess, error, hash }
}

// ─── fundInvoice ──────────────────────────────────────────────────────────────

export function useFundInvoice() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isConfirming, isSuccess, reset } = useWaitAfterTx(hash)

  const fundInvoice = (tokenId: bigint, amount: bigint) => {
    reset()
    writeContract({
      address: CONTRACTS.LendingPool.address,
      abi: CONTRACTS.LendingPool.abi,
      functionName: 'fundInvoice',
      args: [tokenId, amount],
      gas: 500_000n,
      gasPrice: 1_000_000_000_000n,
    })
  }

  return { fundInvoice, isPending, isConfirming, isSuccess, error, hash }
}

// ─── repay ────────────────────────────────────────────────────────────────────

export function useRepay() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isConfirming, isSuccess, reset } = useWaitAfterTx(hash)

  const repay = (tokenId: bigint) => {
    reset()
    writeContract({
      address: CONTRACTS.LendingPool.address,
      abi: CONTRACTS.LendingPool.abi,
      functionName: 'repay',
      args: [tokenId],
      gas: 500_000n,
      gasPrice: 1_000_000_000_000n,
    })
  }

  return { repay, isPending, isConfirming, isSuccess, error, hash }
}

// ─── getAmountOwed read ────────────────────────────────────────────────────────

export function useAmountOwed(tokenId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.LendingPool.address,
    abi: CONTRACTS.LendingPool.abi,
    functionName: 'getAmountOwed',
    args: tokenId != null ? [tokenId] : undefined,
    query: {
      enabled: tokenId != null && CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY',
      refetchInterval: 30_000,
    },
  })
}

// ─── getLoan read ──────────────────────────────────────────────────────────────

export function useGetLoan(tokenId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.LendingPool.address,
    abi: CONTRACTS.LendingPool.abi,
    functionName: 'loans',
    args: tokenId != null ? [tokenId] : undefined,
    query: {
      enabled: tokenId != null && CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY',
      refetchInterval: 15_000,
    },
  })
}

// ─── getActiveTokenIds read ───────────────────────────────────────────────────

export function useActiveTokenIds() {
  return useReadContract({
    address: CONTRACTS.LendingPool.address,
    abi: CONTRACTS.LendingPool.abi,
    functionName: 'getActiveTokenIds',
    query: {
      enabled: CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY',
      refetchInterval: 15_000,
    },
  })
}

// ─── getLoanPositions read ────────────────────────────────────────────────────

export function useGetLoanPositions(tokenId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.LendingPool.address,
    abi: CONTRACTS.LendingPool.abi,
    functionName: 'getLoanPositions',
    args: tokenId != null ? [tokenId] : undefined,
    query: {
      enabled: tokenId != null && CONTRACTS.LendingPool.address !== 'TO_BE_FILLED_ON_DEPLOY',
    },
  })
}
