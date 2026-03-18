import { NextRequest, NextResponse } from 'next/server'
import { aiAnalysisCache } from '@/lib/ipfs/snapshot-cache'

/**
 * GET /api/ai/cache?tokenId=3
 * Retrieve cached AI analysis result for a token.
 *
 * POST /api/ai/cache
 * Store AI analysis result: { tokenId: string, result: AIAnalysisResult }
 */

export async function GET(request: NextRequest) {
  const tokenId = request.nextUrl.searchParams.get('tokenId')
  if (!tokenId) {
    return NextResponse.json({ error: 'tokenId required' }, { status: 400 })
  }

  const cached = aiAnalysisCache.get(tokenId)
  if (!cached) {
    return NextResponse.json({ error: 'No cached analysis' }, { status: 404 })
  }

  return NextResponse.json({ result: cached })
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { tokenId: string; result: Record<string, unknown> }

  if (!body.tokenId || !body.result) {
    return NextResponse.json({ error: 'tokenId and result required' }, { status: 400 })
  }

  aiAnalysisCache.set(body.tokenId, body.result)
  return NextResponse.json({ status: 'cached' })
}
