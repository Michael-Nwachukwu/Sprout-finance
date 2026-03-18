import { NextRequest, NextResponse } from 'next/server'
import { snapshotCache } from '@/lib/ipfs/snapshot-cache'
import { getW3upClient } from '@/lib/ipfs/w3up-client'

/**
 * POST /api/ipfs
 * Uploads files to IPFS via web3.storage w3up.
 *
 * Mode 1 — application/json: { snapshot: object }
 *   Uploads snapshot.json as a single file → returns CID
 *
 * Mode 2 — multipart/form-data: snapshot (text) + file[] fields
 *   Uploads as IPFS directory (snapshot.json + all files) → returns directory CID
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      const { snapshot } = (await request.json()) as { snapshot: object }
      const jsonBytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2))
      const file = new File([jsonBytes], 'snapshot.json', { type: 'application/json' })

      const client = await getW3upClient()
      const cid = await client.uploadFile(file)
      const cidStr = cid.toString()

      // Cache locally for fast reads
      snapshotCache.set(cidStr, snapshot as Record<string, unknown>)
      console.log('[ipfs] Uploaded snapshot.json → CID:', cidStr)

      return NextResponse.json({ cid: cidStr })
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()

      // Build file list for directory upload
      const files: File[] = []

      // Add snapshot.json from the "snapshot" text field
      const snapshotText = formData.get('snapshot') as string | null
      if (snapshotText) {
        const jsonBytes = new TextEncoder().encode(snapshotText)
        files.push(new File([jsonBytes], 'snapshot.json', { type: 'application/json' }))

        // Cache snapshot locally
        try {
          const parsed = JSON.parse(snapshotText)
          // We'll set the cache after we have the CID
          // Store parsed for later
          Object.defineProperty(files, '_parsedSnapshot', { value: parsed, enumerable: false })
        } catch {
          // Not valid JSON — skip caching
        }
      }

      // Add all uploaded files
      const fileEntries = formData.getAll('file')
      for (const entry of fileEntries) {
        if (entry instanceof File) {
          files.push(entry)
        }
      }

      if (files.length === 0) {
        return NextResponse.json({ error: 'No files provided' }, { status: 400 })
      }

      const client = await getW3upClient()
      const cid = await client.uploadDirectory(files)
      const cidStr = cid.toString()

      // Cache snapshot if we parsed it
      if (snapshotText) {
        try {
          const parsed = JSON.parse(snapshotText)
          snapshotCache.set(cidStr, parsed)
        } catch {
          // skip
        }
      }

      console.log(`[ipfs] Uploaded directory (${files.length} files) → CID: ${cidStr}`)
      console.log(`[ipfs] Files: ${files.map((f) => f.name).join(', ')}`)

      return NextResponse.json({ cid: cidStr })
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
  } catch (err) {
    console.error('[ipfs] Upload error:', err)
    return NextResponse.json(
      { error: `IPFS upload failed: ${(err as Error).message}` },
      { status: 500 }
    )
  }
}
