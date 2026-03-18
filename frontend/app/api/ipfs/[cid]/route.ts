import { NextRequest, NextResponse } from 'next/server'
import { snapshotCache } from '@/lib/ipfs/snapshot-cache'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  const { cid } = await params

  const snapshot = snapshotCache.get(cid)
  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  return NextResponse.json({ snapshot })
}
