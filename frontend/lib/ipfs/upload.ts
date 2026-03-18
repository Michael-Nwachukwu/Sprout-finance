'use client'

import { keccak256 } from 'viem'

/**
 * Upload an invoice directory to IPFS via the /api/ipfs API route.
 * Uploads snapshot JSON + all supporting docs + legal assignment as a single
 * IPFS directory. Returns the directory CID.
 *
 * The directory structure on IPFS:
 *   /snapshot.json    — invoice data snapshot
 *   /purchase-order.pdf (or whatever filename)
 *   /bill-of-lading.pdf
 *   /legal-assignment.json
 */
export async function uploadInvoiceDirectory(
  invoiceJson: object,
  supportingDocs: File[],
  legalAssignment?: File | Blob
): Promise<string> {
  const formData = new FormData()

  // Snapshot as a text field (server builds the File)
  formData.append('snapshot', JSON.stringify(invoiceJson))

  // Supporting docs
  for (const doc of supportingDocs) {
    formData.append('file', doc)
  }

  // Legal assignment
  if (legalAssignment) {
    const laFile =
      legalAssignment instanceof File
        ? legalAssignment
        : new File([legalAssignment], 'legal-assignment.json', { type: 'application/json' })
    formData.append('file', laFile)
  }

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
 * Compute keccak256 hash of a File's bytes (for legalAssignmentHash).
 * Returns a 0x-prefixed hex string.
 */
export async function hashFile(file: File): Promise<`0x${string}`> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return keccak256(bytes)
}
