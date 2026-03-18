// Server-only in-memory cache for IPFS snapshots (demo/hackathon purposes)
// In production, these would be fetched from IPFS gateways via the CID

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const snapshotCache = new Map<string, Record<string, any>>()

// Cache for AI analysis results keyed by token ID
// Stored during minting so lenders can view without re-running analysis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const aiAnalysisCache = new Map<string, Record<string, any>>()
