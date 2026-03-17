'use client'

import { keccak256 } from 'viem'

/**
 * Upload a JSON invoice snapshot to IPFS via the /api/ipfs API route.
 * Returns the IPFS CID string.
 */
export async function uploadInvoiceSnapshot(invoiceJson: object): Promise<string> {
  const res = await fetch('/api/ipfs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: invoiceJson }),
  })
  if (!res.ok) {
    const err: { error?: string } = await res.json()
    throw new Error(err.error ?? 'IPFS upload failed')
  }
  const data: { cid: string } = await res.json()
  return data.cid
}

/**
 * Upload a document file (PDF, image, etc.) to IPFS via the /api/ipfs API route.
 * Returns the IPFS CID string.
 */
export async function uploadDocument(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/ipfs', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err: { error?: string } = await res.json()
    throw new Error(err.error ?? 'IPFS upload failed')
  }
  const data: { cid: string } = await res.json()
  return data.cid
}

/**
 * Compute keccak256 hash of a File's bytes (for legalAssignmentHash).
 * Returns a 0x-prefixed hex string.
 */
export async function hashFile(file: File): Promise<`0x${string}`> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return keccak256(bytes)
}
