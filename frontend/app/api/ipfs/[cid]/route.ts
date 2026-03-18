import { NextRequest, NextResponse } from 'next/server'
import { snapshotCache } from '@/lib/ipfs/snapshot-cache'

const GATEWAY_URL = 'https://w3s.link/ipfs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  const { cid } = await params

  // 1. Try local cache first
  const cached = snapshotCache.get(cid)
  if (cached) {
    return NextResponse.json({ snapshot: cached })
  }

  // 2. Fallback: fetch from IPFS gateway
  try {
    const gatewayRes = await fetch(`${GATEWAY_URL}/${cid}/snapshot.json`, {
      signal: AbortSignal.timeout(15_000),
    })

    if (gatewayRes.ok) {
      const snapshot = await gatewayRes.json()
      snapshotCache.set(cid, snapshot)
      return NextResponse.json({ snapshot })
    }
  } catch (err) {
    console.warn(`[ipfs] Gateway fetch failed for ${cid}:`, (err as Error).message)
  }

  return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
}
