'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'
import type { OnChainInvoice } from '@/lib/invoicefi/types'

// ─── requestMint hook ────────────────────────────────────────────────────────

interface RequestMintArgs {
  tokenId: bigint
  borrower: `0x${string}`
  invoiceHash: `0x${string}`
  faceValueUSD: bigint
  faceValueOriginal: bigint
  originalCurrency: `0x${string}` // bytes3
  dueDate: bigint
  issuedDate: bigint
  debtorHash: `0x${string}`
  qbInvoiceId: string
  qbRealmId: string
  discountRateBps: number
  riskTier: number
  maxLtvBps: number
  isCollateralized: boolean
  isRepaid: boolean
  ipfsCID: string
  legalAssignmentHash: `0x${string}`
}

export function useRequestMint() {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const publicClient = usePublicClient()
  const [pendingTokenId, setPendingTokenId] = useState<bigint | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [mintError, setMintError] = useState<Error | null>(null)
  const error = writeError || mintError
  const [isSuccess, setIsSuccess] = useState(false)
  const borrowerRef = useRef<`0x${string}` | null>(null)
  const pollingRef = useRef(false)

  // Once we have a hash, poll the contract to find the new token ID.
  // We snapshot existing token IDs BEFORE the tx, then look for a NEW one after.
  const knownTokenIdsRef = useRef<Set<string>>(new Set())

  // Snapshot existing tokens when requestMint is called (before tx)
  const snapshotExistingTokens = useCallback(async () => {
    if (!publicClient) return
    const known = new Set<string>()
    for (let id = 1n; id <= 50n; id++) {
      try {
        await publicClient.readContract({
          address: CONTRACTS.InvoiceNFT.address,
          abi: CONTRACTS.InvoiceNFT.abi,
          functionName: 'getInvoice',
          args: [id],
        })
        known.add(id.toString())
      } catch {
        break // no more tokens
      }
    }
    knownTokenIdsRef.current = known
    console.log('[useRequestMint] snapshot existing tokens:', [...known].join(', '))
  }, [publicClient])

  // After tx hash received, poll for a NEW token that didn't exist before
  useEffect(() => {
    if (!hash || !publicClient || pollingRef.current) return
    pollingRef.current = true
    setIsConfirming(true)

    const borrower = borrowerRef.current
    const knownBefore = knownTokenIdsRef.current
    console.log('[useRequestMint] tx submitted:', hash, '— polling for new token...')

    let attempts = 0
    const maxAttempts = 60 // 5 minutes max

    const poll = setInterval(async () => {
      attempts++
      try {
        for (let id = 1n; id <= 50n; id++) {
          // Skip tokens that existed BEFORE our tx
          if (knownBefore.has(id.toString())) continue

          try {
            const invoice = await publicClient.readContract({
              address: CONTRACTS.InvoiceNFT.address,
              abi: CONTRACTS.InvoiceNFT.abi,
              functionName: 'getInvoice',
              args: [id],
            }) as OnChainInvoice

            if (
              invoice &&
              invoice.borrower?.toLowerCase() === borrower?.toLowerCase() &&
              invoice.faceValueUSD > 0n
            ) {
              console.log('[useRequestMint] found NEW token:', id.toString())
              clearInterval(poll)
              setIsConfirming(false)
              setIsSuccess(true)
              setPendingTokenId(id)
              return
            }
          } catch {
            break // no more tokens
          }
        }
      } catch (err) {
        console.warn('[useRequestMint] poll error:', err)
      }

      if (attempts >= maxAttempts) {
        console.error('[useRequestMint] timed out — no new token found. The transaction may have reverted.')
        clearInterval(poll)
        setIsConfirming(false)
        setMintError(new Error('Transaction may have failed — no new invoice found on-chain after 5 minutes. The invoice ID may already be used.'))
      }
    }, 5000)

    return () => clearInterval(poll)
  }, [hash, publicClient])

  const requestMint = async (args: RequestMintArgs) => {
    setPendingTokenId(null)
    setIsConfirming(false)
    setIsSuccess(false)
    setMintError(null)
    pollingRef.current = false
    borrowerRef.current = args.borrower

    // Snapshot existing tokens BEFORE submitting so we can detect new ones
    await snapshotExistingTokens()

    writeContract({
      address: CONTRACTS.InvoiceNFT.address,
      abi: CONTRACTS.InvoiceNFT.abi,
      functionName: 'requestMint',
      args: [args],
      // pallet_revive requires legacy (type 0) transactions
      gasPrice: 1_000_000_000_000n,
    })
  }

  return {
    requestMint,
    isPending,
    isConfirming,
    isSuccess,
    pendingTokenId,
    error,
    hash,
  }
}

// ─── approveNFT hook ──────────────────────────────────────────────────────────

export function useApproveNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const firedRef = useRef(false)

  // pallet_revive RPC returns stale reads for getApproved, so we use a
  // time-based wait instead of polling. 15s is enough for block inclusion.
  useEffect(() => {
    if (!hash || firedRef.current) return
    firedRef.current = true
    setIsConfirming(true)

    console.log('[useApproveNFT] tx submitted:', hash, '— waiting 15s for block inclusion...')

    const timer = setTimeout(() => {
      console.log('[useApproveNFT] assuming confirmed after 15s')
      setIsConfirming(false)
      setIsSuccess(true)
    }, 15_000)

    return () => clearTimeout(timer)
  }, [hash])

  const approve = (tokenId: bigint, spender: `0x${string}`) => {
    firedRef.current = false
    setIsConfirming(false)
    setIsSuccess(false)
    writeContract({
      address: CONTRACTS.InvoiceNFT.address,
      abi: CONTRACTS.InvoiceNFT.abi,
      functionName: 'approve',
      args: [spender, tokenId],
      gas: 100_000n,
      gasPrice: 1_000_000_000_000n,
    })
  }

  return { approve, isPending, isConfirming, isSuccess, error, hash }
}

// ─── getInvoice read hook ─────────────────────────────────────────────────────

export function useGetInvoice(tokenId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.InvoiceNFT.address,
    abi: CONTRACTS.InvoiceNFT.abi,
    functionName: 'getInvoice',
    args: tokenId != null ? [tokenId] : undefined,
    query: {
      enabled: tokenId != null && CONTRACTS.InvoiceNFT.address !== 'TO_BE_FILLED_ON_DEPLOY',
    },
  })
}

// ─── Polling hook — waits until Acurast fulfills risk (riskTier > 0) ─────────

/**
 * Polls getInvoice every 10 seconds until riskTier is non-zero.
 * Used in the MintWizard "awaiting" step.
 */
export function usePollFulfillment(
  tokenId: bigint | null,
  onFulfilled: (invoice: OnChainInvoice) => void
) {
  const { data, refetch } = useGetInvoice(tokenId)
  const fulfilledRef = useRef(false)

  useEffect(() => {
    if (tokenId == null || fulfilledRef.current) return

    const interval = setInterval(async () => {
      const result = await refetch()
      const raw = result.data
      console.log('[usePollFulfillment] raw data:', raw)
      const invoice = raw as OnChainInvoice | undefined
      if (invoice && invoice.riskTier > 0) {
        console.log('[usePollFulfillment] fulfilled! riskTier:', invoice.riskTier)
        fulfilledRef.current = true
        clearInterval(interval)
        onFulfilled(invoice)
      }
    }, 10_000)

    return () => clearInterval(interval)
  }, [tokenId, refetch, onFulfilled])

  const invoice = data as OnChainInvoice | undefined
  const isFulfilled = invoice != null && invoice.riskTier > 0

  return { invoice, isFulfilled }
}
