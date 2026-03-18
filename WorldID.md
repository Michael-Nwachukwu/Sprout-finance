# World ID Integration Guide — Battle-Tested Reference

> **Purpose**: This document contains everything an LLM (or developer) needs to integrate World ID into a project on the first attempt. It was written after extensive trial-and-error integrating World ID into a Chainlink CRE hackathon project (ClaimShield). Every pitfall, version mismatch, and staging environment gotcha is documented here.

---

## Table of Contents

1. [What Is World ID](#what-is-world-id)
2. [Core Concepts](#core-concepts)
3. [API Versions — v1 vs v2 vs v4 (CRITICAL)](#api-versions--v1-vs-v2-vs-v4-critical)
4. [Staging vs Production Environments (CRITICAL)](#staging-vs-production-environments-critical)
5. [IDKit Versions — v3 Widget vs v4 Widget](#idkit-versions--v3-widget-vs-v4-widget)
6. [Developer Portal Setup](#developer-portal-setup)
7. [Architecture Overview](#architecture-overview)
8. [Proof Generation (Frontend)](#proof-generation-frontend)
9. [Proof Verification (Backend / Server-Side)](#proof-verification-backend--server-side)
10. [Issues We Hit and How We Fixed Them](#issues-we-hit-and-how-we-fixed-them)
11. [Working Code Examples](#working-code-examples)
12. [Package Versions That Work Together](#package-versions-that-work-together)
13. [Quick Reference Cheat Sheet](#quick-reference-cheat-sheet)

---

## What Is World ID

World ID is a privacy-preserving identity protocol by Worldcoin (now "World"). It uses zero-knowledge proofs to verify that a user is a unique human without revealing who they are. The core use case is Sybil resistance — proving "one person = one action" without exposing identity.

**How it works in practice:**
1. User generates a ZK proof via the World App (mobile) or Simulator (staging)
2. Your app sends that proof to the World ID Cloud API for verification
3. API returns `{ success: true }` if the proof is valid + the `nullifier_hash` (unique per user+app+action)
4. You use the nullifier to enforce one-action-per-human

---

## Core Concepts

### Nullifier Hash
- A deterministic, unique identifier for a (user, app, action) tuple
- Same user + same app_id + same action = ALWAYS the same nullifier_hash
- Different app or action = different nullifier
- You CANNOT derive the user's identity from the nullifier
- A "new proof" from the same user for the same action will have a **different ZKP** but the **same nullifier_hash**

### Verification Level
- `"orb"` — user verified their iris at a physical Worldcoin Orb (strongest)
- `"device"` — user verified via their phone (weaker, but still Sybil-resistant)
- The `deviceLegacy()` preset in IDKit v4 generates device-level proofs

### Signal
- An optional arbitrary string bound to the proof
- Use it to bind a proof to a specific transaction (e.g., a claim ID)
- If you don't need it, pass `""` (empty string)

### Action
- A string you define in the Developer Portal (e.g., `"submit-claim"`)
- Each action has its own nullifier space — same user gets a different nullifier per action
- Must match exactly between proof generation and verification

### Merkle Root
- The root of the World ID identity tree at the time the proof was generated
- Proofs reference a specific merkle root; very old roots may be rejected

---

## API Versions — v1 vs v2 vs v4 (CRITICAL)

This is the single biggest source of confusion and bugs. World ID has multiple API versions that are NOT interchangeable.

### v1 API (DEPRECATED — DO NOT USE)
```
POST https://developer.worldcoin.org/api/v1/verify/{app_id}
```
- Expects flat body: `{ merkle_root, nullifier_hash, proof, verification_level, action, signal }`
- Returns: `{ success: true/false, nullifier_hash, ... }`
- **Returns 404 for many apps now.** This API endpoint is effectively dead.

### v2 API (DEPRECATED)
```
POST https://developer.worldcoin.org/api/v2/verify/{app_id}/{action}
```
- Action in URL path instead of body
- Also likely deprecated

### v4 API (CURRENT — USE THIS)
```
POST https://developer.worldcoin.org/api/v4/verify/{app_id}
```
- Expects the **raw IDKit v3/v4 response object** as the body
- The body format matches what IDKit returns — forward it as-is
- Body includes: `action`, `environment`, `nonce`, `protocol_version`, `responses[]`
- Returns: `{ success: true/false, ... }`

**Key insight**: With v4, you don't remap fields. The IDKit widget returns a JSON object — you POST that entire object to the v4 verify endpoint. No field renaming needed.

---

## Staging vs Production Environments (CRITICAL)

### The #1 Bug We Hit
We generated proofs using IDKit with `environment="staging"` (connecting to `simulator.worldcoin.org`), then tried to verify them against the **production** API (`https://developer.worldcoin.org/api/v4/verify/...`). This returned **404** or verification failure every time.

### The Rule
| Proof generated in | Must be verified against |
|---|---|
| Production (real World App) | `https://developer.worldcoin.org/api/v4/verify/{app_id}` |
| Staging (Simulator) | `https://staging-developer.worldcoin.org/api/v4/verify/{app_id}` |

**If you use `environment="staging"` in IDKit, you MUST verify against `staging-developer.worldcoin.org`.**

### How Staging Works
1. Create your app in the World ID Developer Portal (staging environment)
2. Set `environment="staging"` in your IDKit widget
3. Use `simulator.worldcoin.org` to scan the QR code and approve
4. The proof is a staging proof — it can only be verified against the staging API

### In Code
```typescript
// WRONG — will 404 or fail for staging proofs
const url = `https://developer.worldcoin.org/api/v4/verify/${appId}`

// CORRECT for staging proofs
const url = `https://staging-developer.worldcoin.org/api/v4/verify/${appId}`

// BEST — make it configurable
const url = `${WORLD_ID_BASE_URL}/api/v4/verify/${appId}`
// where WORLD_ID_BASE_URL = "https://staging-developer.worldcoin.org" for staging
// or    WORLD_ID_BASE_URL = "https://developer.worldcoin.org" for production
```

---

## IDKit Versions — v3 Widget vs v4 Widget

### IDKit v4 (`@worldcoin/idkit@^4.0.8`) — WHAT WE USED

IDKit v4 is a complete rewrite. The API surface changed significantly from v3.

**Key differences from older versions:**
1. Uses `IDKitRequestWidget` component (not `IDKitWidget`)
2. Requires a **signing server** for `rp_context` (Relying Party context)
3. The `onSuccess` callback returns a different shape — proof data is in `responses[0]`
4. Field naming: `nullifier` (not `nullifier_hash`), `identifier` (not `verification_level`)
5. Requires `@worldcoin/idkit-server` on the backend for `signRequest()`
6. Uses presets like `deviceLegacy()` instead of `verification_level` prop

**IDKit v4 result shape:**
```json
{
  "action": "submit-claim",
  "environment": "staging",
  "nonce": "0x...",
  "protocol_version": "3.0",
  "responses": [
    {
      "identifier": "orb",
      "merkle_root": "0x...",
      "nullifier": "0x...",
      "proof": "0x..."
    }
  ]
}
```

This entire object is what you POST to the v4 Cloud API. Do NOT remap fields.

**IDKit v3 (legacy) result shape (for reference):**
```json
{
  "merkle_root": "0x...",
  "nullifier_hash": "0x...",
  "proof": "0x...",
  "verification_level": "orb"
}
```

If using IDKit v4 but need v3-style fields (e.g., for onchain contracts that expect `nullifier_hash`), remap in your `onSuccess` handler:
```javascript
const r = result.responses?.[0]
const legacyFormat = {
    merkle_root: r.merkle_root,
    nullifier_hash: r.nullifier,       // "nullifier" → "nullifier_hash"
    proof: r.proof,
    verification_level: r.identifier,  // "identifier" → "verification_level"
}
```

---

## Developer Portal Setup

1. Go to https://developer.worldcoin.org/
2. Create a new app — set environment to **Staging** for development
3. Note your `app_id` (starts with `app_`)
4. Create an **Action** (e.g., `submit-claim`) — this is required
5. For IDKit v4: Note your **RP ID** (starts with `rp_`) and **RP Signing Key** (32-byte hex)
6. These go in your `.env`:
   ```
   WORLD_ID_APP_ID=app_d2d6e31b837c0b48bd8d9093f3b8f300
   WORLD_ID_ACTION=submit-claim
   RP_ID=rp_...
   RP_SIGNING_KEY=...
   ```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PROOF GENERATION                        │
│                                                             │
│  1. Signing Server (port 4568)                              │
│     └─ signRequest(action, RP_SIGNING_KEY) → rp_context     │
│                                                             │
│  2. React Frontend (port 4567)                              │
│     └─ IDKitRequestWidget + deviceLegacy()                  │
│     └─ environment="staging"                                │
│     └─ User scans QR at simulator.worldcoin.org             │
│     └─ onSuccess → raw IDKit v4 JSON object                 │
│                                                             │
│  3. Save proof to world-id-proof.json                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   PROOF VERIFICATION                        │
│                                                             │
│  POST ${BASE_URL}/api/v4/verify/${app_id}                   │
│  Body: the raw IDKit JSON (forwarded as-is)                 │
│  Headers: Content-Type: application/json                    │
│                                                             │
│  BASE_URL:                                                  │
│    staging  → https://staging-developer.worldcoin.org       │
│    production → https://developer.worldcoin.org             │
│                                                             │
│  Response: { success: true/false, ... }                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Proof Generation (Frontend)

### Requirements
- `@worldcoin/idkit@^4.0.8` — the IDKit React widget (v4)
- `@worldcoin/idkit-server@^1.0.0` — server-side signing (for rp_context)
- A signing server running locally
- Vite with `@worldcoin/idkit-core` excluded from pre-bundling (WASM issue)

### Step 1: Signing Server

IDKit v4 requires a signed `rp_context` for each verification request. This must be generated server-side using your `RP_SIGNING_KEY`.

```typescript
// signing-server.ts — runs on port 4568
import { signRequest } from '@worldcoin/idkit-server'

const RP_ID = process.env.RP_ID           // rp_...
const RP_SIGNING_KEY = process.env.RP_SIGNING_KEY  // 32-byte hex

Bun.serve({
    port: 4568,
    fetch(req) {
        const url = new URL(req.url)

        // CORS preflight
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            })
        }

        if (url.pathname === '/rp-context') {
            const action = url.searchParams.get('action') ?? 'submit-claim'
            const result = signRequest(action, RP_SIGNING_KEY!)
            const rpContext = {
                rp_id: RP_ID,
                nonce: result.nonce,
                created_at: result.createdAt,
                expires_at: result.expiresAt,
                signature: result.sig,
            }
            return new Response(JSON.stringify(rpContext), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            })
        }

        return new Response('Not found', { status: 404 })
    },
})
```

Run: `bun --env-file .env signing-server.ts`

### Step 2: React Frontend with IDKit v4

```jsx
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { IDKit, IDKitRequestWidget, deviceLegacy } from '@worldcoin/idkit'

// Read app_id and action from URL hash: #APP_ID|ACTION
const rawHash = window.location.hash.slice(1)
const hash = decodeURIComponent(rawHash)
const [APP_ID, ACTION] = hash.includes('|')
    ? hash.split('|')
    : [hash || '', 'submit-claim']

function App() {
    const [proof, setProof] = useState(null)
    const [rpContext, setRpContext] = useState(null)
    const [open, setOpen] = useState(false)

    const handleVerify = async () => {
        // Step 1: Get signed rp_context from signing server
        const res = await fetch(
            `http://localhost:4568/rp-context?action=${encodeURIComponent(ACTION)}`
        )
        const data = await res.json()

        setRpContext(data)
        setOpen(true)
    }

    const onSuccess = (result) => {
        console.log('IDKit raw result:', JSON.stringify(result, null, 2))

        // IDKit v4: proof data is in responses[0]
        // Field names: "nullifier" (not "nullifier_hash"), "identifier" (not "verification_level")
        const r = result.responses?.[0]
        if (r) {
            setProof({
                // Remap to legacy field names if needed for your backend
                merkle_root: r.merkle_root,
                nullifier_hash: r.nullifier,
                proof: r.proof,
                verification_level: r.identifier ?? 'device',
            })
        }

        // OR: Save the raw v4 result as-is for the v4 API (recommended)
        // setProof(result)  // forward entire object to v4 verify endpoint
    }

    return (
        <div>
            {rpContext && (
                <IDKitRequestWidget
                    app_id={APP_ID}
                    action={ACTION}
                    rp_context={rpContext}
                    allow_legacy_proofs={true}
                    preset={deviceLegacy()}
                    environment="staging"        // "staging" for simulator, remove for production
                    open={open}
                    onOpenChange={setOpen}
                    onSuccess={onSuccess}
                    onError={(code) => console.error('IDKit error:', code)}
                />
            )}

            {!proof ? (
                <button onClick={handleVerify}>
                    Verify with World ID
                </button>
            ) : (
                <pre>{JSON.stringify(proof, null, 2)}</pre>
            )}
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

### Step 3: Vite Config (Important!)

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: { port: 4567 },
    optimizeDeps: {
        // CRITICAL: Exclude idkit-core from pre-bundling so the WASM file
        // stays resolvable via import.meta.url. Without this, IDKit crashes.
        exclude: ['@worldcoin/idkit-core'],
    },
})
```

### Step 4: Generate the Proof

1. Start signing server: `bun --env-file .env signing-server.ts`
2. Start frontend: `cd worldid-gen && npm run dev`
3. Open: `http://localhost:4567/#app_YOUR_APP_ID|submit-claim`
4. Click "Verify with World ID"
5. Open https://simulator.worldcoin.org/ — Scanner — scan the QR code
6. Click Approve in the Simulator
7. Copy the proof JSON and save to `world-id-proof.json`

---

## Proof Verification (Backend / Server-Side)

### Simple Server-Side Verification (TypeScript/Bun)

```typescript
// verify-world-id.ts
import fs from 'fs'
import path from 'path'

export type WorldIDProof = Record<string, any>

interface WorldIDVerifyResponse {
    success: boolean
    nullifier_hash?: string
    nullifier?: string
    results?: any[]
    code?: string
    detail?: string
}

/**
 * Read the proof file. For v4 API, this is the raw IDKit result object.
 */
export function readProofFromFile(proofFilePath?: string): WorldIDProof {
    const filePath = proofFilePath ?? path.resolve(process.cwd(), 'world-id-proof.json')
    if (!fs.existsSync(filePath)) {
        throw new Error(`World ID proof file not found: ${filePath}`)
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * Verify a World ID proof via the Cloud API.
 *
 * CRITICAL: Use staging-developer.worldcoin.org for staging proofs.
 */
export async function verifyWorldIDProof(proof: WorldIDProof): Promise<string> {
    const appId = process.env.WORLD_ID_APP_ID
    const action = process.env.WORLD_ID_ACTION ?? 'submit-claim'

    if (!appId) throw new Error('WORLD_ID_APP_ID is not set')

    // CRITICAL: Match the base URL to the environment the proof was generated in
    const isStaging = proof.environment === 'staging'
    const baseUrl = isStaging
        ? 'https://staging-developer.worldcoin.org'
        : 'https://developer.worldcoin.org'

    const url = `${baseUrl}/api/v4/verify/${appId}`

    // For v4 API: forward the raw IDKit proof object, add action and signal
    const body = {
        ...proof,
        action: action,
        signal: '',
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    const json: WorldIDVerifyResponse = await res.json() as WorldIDVerifyResponse

    if (!res.ok || !json.success) {
        const reason = json.detail ?? json.code ?? 'Unknown error'
        throw new Error(`World ID verification failed: ${reason} (code: ${json.code ?? 'N/A'})`)
    }

    // v4 returns "nullifier", v1 returned "nullifier_hash"
    return json.nullifier
        ?? (json.results?.[0]?.nullifier)
        ?? 'unknown'
}
```

---

## Issues We Hit and How We Fixed Them

### Issue 1: API v1 Returning 404

**Symptom**: `POST https://developer.worldcoin.org/api/v1/verify/app_xxx` returns an HTML 404 page.

**Root cause**: The v1 API is deprecated. Many app IDs don't work with it anymore.

**Fix**: Use the v4 API endpoint: `/api/v4/verify/{app_id}`

### Issue 2: Staging Proofs Failing Against Production API

**Symptom**: Proof generated with `environment="staging"` in IDKit, verified against `developer.worldcoin.org`, returns 404 or `{ success: false }`.

**Root cause**: Staging proofs (from `simulator.worldcoin.org`) exist in a different merkle tree than production proofs. The production API doesn't know about staging identities.

**Fix**: Verify staging proofs against `https://staging-developer.worldcoin.org/api/v4/verify/{app_id}`.

### Issue 3: IDKit v4 Field Name Changes

**Symptom**: Backend expects `nullifier_hash` and `verification_level` but gets `undefined`.

**Root cause**: IDKit v4 changed field names:
- `nullifier_hash` → `nullifier`
- `verification_level` → `identifier`
- Proof data moved from top-level to `responses[0]`

**Fix**: Access via `result.responses[0].nullifier` and `result.responses[0].identifier`.

### Issue 4: IDKit v4 Requires rp_context (Signing Server)

**Symptom**: IDKit widget fails to open or throws an error about missing rp_context.

**Root cause**: IDKit v4 requires a server-signed `rp_context` object for each verification request. This is a security measure — the signing happens with your `RP_SIGNING_KEY` on the backend.

**Fix**: Run a local signing server using `@worldcoin/idkit-server`:
```typescript
import { signRequest } from '@worldcoin/idkit-server'
const result = signRequest(action, RP_SIGNING_KEY)
// Return { rp_id, nonce, created_at, expires_at, signature } to frontend
```

### Issue 5: Vite WASM Pre-bundling Crash

**Symptom**: IDKit crashes at runtime with a WASM-related error or "unreachable" instruction.

**Root cause**: Vite pre-bundles `@worldcoin/idkit-core` which contains WASM. Pre-bundling breaks the WASM import.

**Fix**: Add to `vite.config.js`:
```javascript
optimizeDeps: {
    exclude: ['@worldcoin/idkit-core'],
}
```

### Issue 6: Same Nullifier on "New" Proof

**Symptom**: User generates a "new proof" but the nullifier_hash is identical to the old one.

**Root cause**: This is expected behavior. The nullifier is deterministic for a (user, app, action) tuple. A "new proof" has a different ZKP (the `proof` field) but the same nullifier. This is by design — it's how Sybil resistance works.

**Fix**: Nothing to fix. This is correct behavior. If you need a different nullifier, use a different `action` string.

### Issue 7: v4 API Body Format — Forward Raw IDKit Response

**Symptom**: Manually constructing the v4 API body with individual fields fails.

**Root cause**: The v4 API expects the raw IDKit response object (with `action`, `environment`, `nonce`, `protocol_version`, `responses[]`). If you remap fields into a flat v1-style body, it fails.

**Fix**: Forward the IDKit response as-is:
```typescript
const body = {
    ...rawIdkitResult,  // contains action, environment, nonce, protocol_version, responses
    signal: '',         // add signal if needed
}
```

### Issue 8: "max_verifications_reached" Error

**Symptom**: Proof verification returns `{ success: false, code: "max_verifications_reached" }`.

**Root cause**: The action in your Developer Portal has `max_verifications = 1` (default). Since the nullifier is the same for the same user, subsequent verifications are rejected.

**Fix**: In the Developer Portal, set the action's max verifications to `0` (unlimited) or a higher number.

---

## Working Code Examples

### Full Proof File Format (IDKit v4 — what gets saved to world-id-proof.json)

```json
{
    "action": "submit-claim",
    "environment": "staging",
    "nonce": "0x00ba9067b8f36d703856b009ac1669b2b99feab9df27532649858fd8face7c84",
    "protocol_version": "3.0",
    "responses": [
        {
            "identifier": "orb",
            "merkle_root": "0x2d6f9e1528085633eb1b107e3707c65b3f411ce23a085ad6b1a56b2a49542b38",
            "nullifier": "0x2dff78c09c00b8dc7eb7249f0742f3be6a742596997e0353eb4dd90563aa4daa",
            "proof": "0x2086a707cb0f4c503e04813f2c010bfdcc8bbbb658873b0f23681d555bc177cd..."
        }
    ]
}
```

### Minimal Verification Script (Bun)

```typescript
#!/usr/bin/env bun
// test-world-id.ts — Quick test to check if World ID verification works
import fs from 'fs'

const APP_ID = process.env.WORLD_ID_APP_ID!
const proof = JSON.parse(fs.readFileSync('world-id-proof.json', 'utf-8'))

// Auto-detect environment from the proof
const isStaging = proof.environment === 'staging'
const baseUrl = isStaging
    ? 'https://staging-developer.worldcoin.org'
    : 'https://developer.worldcoin.org'

const url = `${baseUrl}/api/v4/verify/${APP_ID}`

console.log(`Verifying against: ${url}`)
console.log(`Environment: ${proof.environment}`)

const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...proof, signal: '' }),
})

const json = await res.json()
console.log(`Status: ${res.status}`)
console.log(`Response:`, JSON.stringify(json, null, 2))
```

### Environment Variables (.env)

```bash
# World ID — Developer Portal
WORLD_ID_APP_ID=app_d2d6e31b837c0b48bd8d9093f3b8f300
WORLD_ID_ACTION=submit-claim

# IDKit v4 Signing Server (required for rp_context)
RP_ID=rp_...
RP_SIGNING_KEY=...

# Optional: Override base URL (auto-detected from proof.environment is better)
# WORLD_ID_BASE_URL=https://staging-developer.worldcoin.org
```

### Package.json Dependencies

```json
{
    "dependencies": {
        "@worldcoin/idkit": "^4.0.8",
        "@worldcoin/idkit-server": "^1.0.0",
        "react": "^18",
        "react-dom": "^18"
    },
    "devDependencies": {
        "@vitejs/plugin-react": "^4.7.0",
        "vite": "^5.4.21"
    }
}
```

---

## Package Versions That Work Together

These exact versions were tested and confirmed working as of March 2026:

| Package | Version | Notes |
|---|---|---|
| `@worldcoin/idkit` | `^4.0.8` | Frontend React widget (v4 API) |
| `@worldcoin/idkit-server` | `^1.0.0` | Server-side `signRequest()` for rp_context |
| `react` | `^18` | Required by IDKit |
| `react-dom` | `^18` | Required by IDKit |
| `vite` | `^5.4.21` | Dev server — must exclude `@worldcoin/idkit-core` from optimizeDeps |
| `@vitejs/plugin-react` | `^4.7.0` | JSX support |

**DO NOT** mix IDKit v3 (`@worldcoin/idkit@^1.x` or `^2.x`) with the v4 Cloud API. They have incompatible proof formats.

---

## Quick Reference Cheat Sheet

```
STAGING PROOF GENERATION:
  1. bun --env-file .env signing-server.ts          (port 4568)
  2. cd worldid-gen && npm run dev                    (port 4567)
  3. Open http://localhost:4567/#app_xxx|submit-claim
  4. Click verify → scan QR at simulator.worldcoin.org → Approve
  5. Copy JSON → save as world-id-proof.json

VERIFICATION:
  Staging:    POST https://staging-developer.worldcoin.org/api/v4/verify/{app_id}
  Production: POST https://developer.worldcoin.org/api/v4/verify/{app_id}
  Body: raw IDKit result JSON + { signal: "" }
  Response: { success: true/false }

KEY RULES:
  - staging proof → staging API (staging-developer.worldcoin.org)
  - production proof → production API (developer.worldcoin.org)
  - v4 API: forward raw IDKit JSON as body (don't remap fields)
  - IDKit v4 fields: responses[0].nullifier, responses[0].identifier
  - IDKit v3 fields: nullifier_hash, verification_level (top-level)
  - Same (user + app + action) = same nullifier always
  - Vite: exclude @worldcoin/idkit-core from optimizeDeps
  - IDKit v4: requires signing server for rp_context
```

---

## Solidity Integration (On-Chain Verification)

If you need to verify World ID proofs on-chain instead of via the Cloud API, World ID provides a Solidity library. This is a separate path from the Cloud API described above.

```solidity
// On-chain verification (alternative to Cloud API)
import { IWorldID } from "@worldcoin/world-id-contracts/interfaces/IWorldID.sol";

contract MyContract {
    IWorldID internal worldId;
    uint256 internal groupId = 1; // orb verification

    function verify(
        address signal,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) public {
        worldId.verifyProof(
            root,
            groupId,
            abi.encodePacked(signal).hashToField(),
            nullifierHash,
            abi.encodePacked(appId, actionId).hashToField(),
            proof
        );
    }
}
```

**Note**: On-chain verification uses different proof encoding than the Cloud API. The ZKP `proof` field needs to be decoded from its hex string into 8 `uint256` values. This is a different integration path — most projects use the Cloud API for simplicity.

---

*Last updated: March 2026. Tested with IDKit v4.0.8, World ID Cloud API v4, staging environment with simulator.worldcoin.org.*
