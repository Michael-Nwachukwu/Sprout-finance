import { NextResponse } from 'next/server'
import { signRequest } from '@worldcoin/idkit/signing'

/**
 * POST /api/world-id/rp-context
 * Generates a signed rp_context for IDKit v4 proof requests.
 * Keeps RP_SIGNING_KEY on the server — never exposed to the client.
 */
export async function POST() {
  const rpId = process.env.RP_ID
  const signingKey = process.env.RP_SIGNING_KEY
  const action = process.env.WORLD_ID_ACTION || 'submit-claim'

  if (!rpId || !signingKey) {
    return NextResponse.json(
      { error: 'RP_ID and RP_SIGNING_KEY must be configured' },
      { status: 500 }
    )
  }

  try {
    const rpSig = signRequest(action, signingKey, 300) // 5-minute TTL

    return NextResponse.json({
      rp_context: {
        rp_id: rpId,
        nonce: rpSig.nonce,
        created_at: rpSig.createdAt,
        expires_at: rpSig.expiresAt,
        signature: rpSig.sig,
      },
    })
  } catch (err) {
    console.error('[world-id] signRequest failed:', err)
    return NextResponse.json(
      { error: `Failed to sign request: ${(err as Error).message}` },
      { status: 500 }
    )
  }
}
