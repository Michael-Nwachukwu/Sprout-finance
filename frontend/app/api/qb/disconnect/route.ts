import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('qb_access_token')
  response.cookies.delete('qb_refresh_token')
  response.cookies.delete('qb_realm_id')
  return response
}
