import { NextRequest, NextResponse } from 'next/server'
import type { QBInvoice } from '@/lib/invoicefi/types'

/**
 * GET /api/qb/invoices
 * Fetches open invoices from QuickBooks using the stored access token cookie.
 * Returns invoices with Balance > 0, sorted by DueDate ascending.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('qb_access_token')?.value
  const realmId = request.cookies.get('qb_realm_id')?.value

  if (!accessToken || !realmId) {
    return NextResponse.json({ error: 'Not connected to QuickBooks' }, { status: 401 })
  }

  const query = encodeURIComponent(
    "SELECT * FROM Invoice WHERE Balance > 0 ORDER BY DueDate ASC MAXRESULTS 20"
  )
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${query}&minorversion=65`

  try {
    const qbResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (qbResponse.status === 401) {
      // Access token expired — try refreshing
      const refreshed = await refreshAccessToken(request)
      if (!refreshed) {
        return NextResponse.json({ error: 'QuickBooks session expired. Please reconnect.' }, { status: 401 })
      }
      // Retry with new token
      const retryResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
          Accept: 'application/json',
        },
      })
      if (!retryResponse.ok) {
        return NextResponse.json({ error: 'Failed to fetch invoices from QuickBooks' }, { status: 502 })
      }
      const data = await retryResponse.json()
      const invoices = extractInvoices(data)
      const response = NextResponse.json({ invoices, realmId })
      response.cookies.set('qb_access_token', refreshed.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: refreshed.expiresIn,
        path: '/',
      })
      return response
    }

    if (!qbResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch invoices from QuickBooks' }, { status: 502 })
    }

    const data = await qbResponse.json()
    const invoices = extractInvoices(data)
    return NextResponse.json({ invoices, realmId })
  } catch (err) {
    console.error('QB invoices fetch error:', err)
    return NextResponse.json({ error: 'Network error fetching QuickBooks invoices' }, { status: 500 })
  }
}

function extractInvoices(data: {
  QueryResponse?: { Invoice?: QBInvoice[] }
}): QBInvoice[] {
  return data.QueryResponse?.Invoice ?? []
}

async function refreshAccessToken(
  request: NextRequest
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const refreshToken = request.cookies.get('qb_refresh_token')?.value
  if (!refreshToken) return null

  const clientId = process.env.QB_CLIENT_ID!
  const clientSecret = process.env.QB_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  try {
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    if (!response.ok) return null
    const data: { access_token: string; expires_in: number } = await response.json()
    return { accessToken: data.access_token, expiresIn: data.expires_in }
  } catch {
    return null
  }
}
