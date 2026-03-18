import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/world-id/verify
 * Verifies a World ID proof server-side.
 *
 * Routes to the correct endpoint based on protocol version:
 * - v3 proofs (from legacy presets) → POST /api/v2/verify/{app_id}
 *   Body: { nullifier_hash, proof, merkle_root, verification_level, action, signal_hash }
 * - v4 proofs → POST /api/v4/verify/{rp_id}
 *   Body: raw IDKit result
 *
 * Body: { result: IDKitResult } — the raw IDKit result object
 * Returns: { verified: true } or error
 */
export async function POST(request: NextRequest) {
  const rpId = process.env.RP_ID
  const appId = process.env.WORLD_ID_APP_ID
  const action = process.env.WORLD_ID_ACTION || 'submit-claim'

  if (!appId && !rpId) {
    return NextResponse.json({ error: 'WORLD_ID_APP_ID or RP_ID must be configured' }, { status: 500 })
  }

  let body: { result: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.result) {
    return NextResponse.json({ error: 'Missing result field' }, { status: 400 })
  }

  const result = body.result
  const protocolVersion = result.protocol_version as string | undefined
  // App was created on the production Developer Portal (developer.worldcoin.org),
  // so verification always goes through the production API — even for staging/simulator proofs.
  // The staging-developer.worldcoin.org portal is a separate system with its own apps.
  const baseUrl = 'https://developer.worldcoin.org'

  try {
    let verifyRes: Response

    if (protocolVersion === '4.0' && rpId) {
      // v4 proof → v4 endpoint with rp_id
      const verifyUrl = `${baseUrl}/api/v4/verify/${rpId}`
      console.log(`[world-id] Verifying v4 proof via ${verifyUrl}`)
      verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
    } else {
      // v3 proof (from legacy presets) → v2 endpoint with app_id
      // URL: /api/v2/verify/{app_id} (action goes in body, NOT in URL)
      const responses = result.responses as Array<Record<string, unknown>> | undefined
      const firstResponse = responses?.[0]

      if (!firstResponse) {
        return NextResponse.json({ error: 'No proof response in result' }, { status: 400 })
      }

      // Debug: log full structure to find where nullifier_hash lives
      console.log(`[world-id] Full result keys:`, Object.keys(result))
      console.log(`[world-id] firstResponse keys:`, Object.keys(firstResponse))
      console.log(`[world-id] firstResponse:`, JSON.stringify(firstResponse, null, 2))

      // IDKit v4 with deviceLegacy() may put nullifier_hash at different levels
      // Try firstResponse first, then fall back to result top-level
      const nullifierHash = (firstResponse.nullifier_hash as string)
        || (firstResponse.nullifier as string)
        || (result.nullifier_hash as string)
        || ''

      // Build v2 body — only include signal_hash if it actually exists
      const v2Body: Record<string, string> = {
        nullifier_hash: nullifierHash,
        proof: (firstResponse.proof as string) || (result.proof as string) || '',
        merkle_root: (firstResponse.merkle_root as string) || (result.merkle_root as string) || '',
        verification_level: (firstResponse.credential_type as string) || (firstResponse.verification_level as string) || (firstResponse.identifier as string) || 'device',
        action,
      }

      // Only include signal_hash if present — empty string causes validation error
      const signalHash = firstResponse.signal_hash as string | undefined
      if (signalHash) {
        v2Body.signal_hash = signalHash
      }

      const verifyUrl = `${baseUrl}/api/v2/verify/${appId}`
      console.log(`[world-id] Verifying v3 proof via ${verifyUrl}`)
      console.log(`[world-id] v2 body:`, JSON.stringify(v2Body, null, 2))
      verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v2Body),
      })
    }

    if (!verifyRes.ok) {
      const errText = await verifyRes.text()
      let errData: Record<string, unknown>
      try {
        errData = JSON.parse(errText)
      } catch {
        errData = { detail: errText || `HTTP ${verifyRes.status}` }
      }
      console.error('[world-id] Verification failed:', errData)
      return NextResponse.json(
        { error: (errData.detail as string) || (errData.message as string) || 'Verification failed', details: errData },
        { status: 400 }
      )
    }

    const data = await verifyRes.json()
    console.log('[world-id] Proof verified successfully')
    return NextResponse.json({ verified: true, data })
  } catch (err) {
    console.error('[world-id] Verification error:', err)
    return NextResponse.json(
      { error: `Verification request failed: ${(err as Error).message}` },
      { status: 500 }
    )
  }
}
