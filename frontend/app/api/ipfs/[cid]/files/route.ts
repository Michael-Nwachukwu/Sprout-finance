import { NextRequest, NextResponse } from 'next/server'
import { fileListCache } from '@/lib/ipfs/snapshot-cache'

const GATEWAY_URL = 'https://w3s.link/ipfs'

/**
 * GET /api/ipfs/[cid]/files
 * Returns a list of files in an IPFS directory CID.
 * Tries local cache first, then fetches directory listing from gateway.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  const { cid } = await params

  // 1. Try local cache
  const cached = fileListCache.get(cid)
  if (cached) {
    return NextResponse.json({ files: cached })
  }

  // 2. Fetch directory listing from IPFS gateway
  // w3s.link returns HTML for directory CIDs with Accept: text/html
  try {
    const res = await fetch(`${GATEWAY_URL}/${cid}`, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch directory listing', files: [] }, { status: 502 })
    }

    const html = await res.text()

    // Parse file names from the gateway HTML directory listing
    // The gateway renders links like <a href="/ipfs/{cid}/{filename}">{filename}</a>
    const fileRegex = /href="[^"]*\/([^/"]+)"[^>]*>\1</g
    const files: { name: string }[] = []
    let match: RegExpExecArray | null

    while ((match = fileRegex.exec(html)) !== null) {
      const name = match[1]
      if (name && name !== '..' && name !== '.') {
        files.push({ name })
      }
    }

    // If HTML parsing didn't work, try common known file names
    if (files.length === 0) {
      const knownFiles = ['snapshot.json', 'legal-assignment.json']
      for (const name of knownFiles) {
        try {
          const fileRes = await fetch(`${GATEWAY_URL}/${cid}/${name}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5_000),
          })
          if (fileRes.ok) {
            files.push({ name })
          }
        } catch {
          // skip
        }
      }
    }

    if (files.length > 0) {
      fileListCache.set(cid, files)
    }

    return NextResponse.json({ files })
  } catch (err) {
    console.warn(`[ipfs] Directory listing failed for ${cid}:`, (err as Error).message)
    return NextResponse.json({ error: 'Gateway timeout', files: [] }, { status: 504 })
  }
}
