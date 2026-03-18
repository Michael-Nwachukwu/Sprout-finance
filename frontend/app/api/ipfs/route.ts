import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { snapshotCache } from '@/lib/ipfs/snapshot-cache'

/**
 * POST /api/ipfs
 * Uploads to IPFS. Currently returns a deterministic placeholder CID.
 * To enable real IPFS uploads, install @web3-storage/w3up-client and
 * @ucanto/principal/ed25519, set WEB3_STORAGE_KEY + WEB3_STORAGE_PROOF,
 * and uncomment the w3up import block below.
 *
 * Body (application/json): { snapshot: object }
 * Body (multipart/form-data): file field
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      const { snapshot } = await request.json() as { snapshot: object }
      const cid = placeholderCid(JSON.stringify(snapshot))
      snapshotCache.set(cid, snapshot as Record<string, unknown>)
      return NextResponse.json({ cid })
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
      const cid = placeholderCid(file.name + file.size)
      return NextResponse.json({ cid })
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
  } catch (err) {
    console.error('IPFS upload error:', err)
    return NextResponse.json({ error: 'IPFS upload failed' }, { status: 500 })
  }
}

/**
 * Deterministic placeholder CID. Replace this function body with real
 * web3.storage upload once credentials are configured.
 * Format matches a valid base32 CIDv1 prefix for UI display purposes.
 */
function placeholderCid(content: string): string {
  const hash = createHash('sha256').update(content).digest('hex')
  return `bafybeig${hash.slice(0, 52)}`
}
