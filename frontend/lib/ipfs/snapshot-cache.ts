// Server-only file-backed cache for IPFS snapshots and AI analysis (demo/hackathon)
// In production, snapshots would be fetched from real IPFS gateways via the CID
// and AI results would live in a proper database.

import fs from 'fs'
import path from 'path'
import os from 'os'

// Use /tmp on serverless (Vercel), .cache locally
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'sprout-cache')
  : path.join(process.cwd(), '.cache')
const SNAPSHOT_FILE = path.join(CACHE_DIR, 'ipfs-snapshots.json')
const AI_CACHE_FILE = path.join(CACHE_DIR, 'ai-analysis.json')

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
  } catch {
    // Read-only filesystem — cache writes will be no-ops
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJsonFile(filePath: string): Record<string, any> {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch {
    // Corrupted or inaccessible file — start fresh
  }
  return {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeJsonFile(filePath: string, data: Record<string, any>) {
  try {
    ensureCacheDir()
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // Serverless filesystem may be read-only — skip caching silently
  }
}

// ── Snapshot Cache ──────────────────────────────────────────────────────────

export const snapshotCache = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(cid: string): Record<string, any> | undefined {
    const all = readJsonFile(SNAPSHOT_FILE)
    return all[cid]
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(cid: string, data: Record<string, any>) {
    const all = readJsonFile(SNAPSHOT_FILE)
    all[cid] = data
    writeJsonFile(SNAPSHOT_FILE, all)
  },
}

// ── File List Cache ────────────────────────────────────────────────────────

const FILE_LIST_FILE = path.join(CACHE_DIR, 'ipfs-file-lists.json')

export const fileListCache = {
  get(cid: string): { name: string }[] | undefined {
    const all = readJsonFile(FILE_LIST_FILE)
    return all[cid]
  },
  set(cid: string, files: { name: string }[]) {
    const all = readJsonFile(FILE_LIST_FILE)
    all[cid] = files
    writeJsonFile(FILE_LIST_FILE, all)
  },
}

// ── AI Analysis Cache ───────────────────────────────────────────────────────

export const aiAnalysisCache = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(tokenId: string): Record<string, any> | undefined {
    const all = readJsonFile(AI_CACHE_FILE)
    return all[tokenId]
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(tokenId: string, data: Record<string, any>) {
    const all = readJsonFile(AI_CACHE_FILE)
    all[tokenId] = data
    writeJsonFile(AI_CACHE_FILE, all)
  },
}
