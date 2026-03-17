import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/qb/callback
 * QuickBooks OAuth callback. Exchanges the auth code for access + refresh tokens.
 * Stores tokens in httpOnly cookies — never in localStorage or component state.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/borrow/mint?qb_error=${encodeURIComponent(error)}`, request.url))
  }

  if (!code || !realmId) {
    return NextResponse.redirect(new URL('/borrow/mint?qb_error=missing_params', request.url))
  }

  // Verify state to prevent CSRF
  const savedState = request.cookies.get('qb_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/borrow/mint?qb_error=invalid_state', request.url))
  }

  const clientId = process.env.QB_CLIENT_ID!
  const clientSecret = process.env.QB_CLIENT_SECRET!
  const redirectUri = process.env.QB_REDIRECT_URI!

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  let tokenData: {
    access_token: string
    refresh_token: string
    expires_in: number
    x_refresh_token_expires_in: number
  }

  try {
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      console.error('QB token exchange failed:', tokenResponse.status, errText)
      const detail = encodeURIComponent(`${tokenResponse.status}: ${errText.slice(0, 200)}`)
      return NextResponse.redirect(new URL(`/borrow/mint?qb_error=token_exchange_failed&detail=${detail}`, request.url))
    }

    tokenData = await tokenResponse.json()
  } catch (err) {
    console.error('QB token exchange error:', err)
    return NextResponse.redirect(new URL('/borrow/mint?qb_error=network_error', request.url))
  }

  const response = NextResponse.redirect(new URL('/borrow/mint?qb_connected=1', request.url))

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }

  // Access token: short-lived (expires_in seconds, default 3600)
  response.cookies.set('qb_access_token', tokenData.access_token, {
    ...cookieOpts,
    maxAge: tokenData.expires_in,
  })

  // Refresh token: long-lived
  response.cookies.set('qb_refresh_token', tokenData.refresh_token, {
    ...cookieOpts,
    maxAge: tokenData.x_refresh_token_expires_in,
  })

  // realmId is not sensitive — store in cookie for convenience
  response.cookies.set('qb_realm_id', realmId, {
    ...cookieOpts,
    maxAge: tokenData.x_refresh_token_expires_in,
    httpOnly: false, // readable by JS for non-sensitive use
  })

  // Clear the state cookie
  response.cookies.delete('qb_oauth_state')

  return response
}
