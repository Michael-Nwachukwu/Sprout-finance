import { NextResponse } from 'next/server'

/**
 * GET /api/qb/auth
 * Redirects the user to the QuickBooks OAuth 2.0 authorization URL.
 */
export async function GET() {
  const clientId = process.env.QB_CLIENT_ID
  const redirectUri = process.env.QB_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'QB_CLIENT_ID or QB_REDIRECT_URI not configured' },
      { status: 500 }
    )
  }

  const state = crypto.randomUUID()
  const scope = 'com.intuit.quickbooks.accounting'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
  })

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  // Store state in cookie to verify on callback
  response.cookies.set('qb_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  return response
}
