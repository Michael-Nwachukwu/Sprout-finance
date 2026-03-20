import { NextRequest, NextResponse } from 'next/server'
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  keccak256,
  encodePacked,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import deployments from '../../../../deployments/polkadot-testnet.json'

// --- Chain config (server-side, no wagmi) ---

const polkadotHubTestnet = defineChain({
  id: Number(deployments.chainId),
  name: 'Polkadot Hub Testnet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: [deployments.rpcUrl] },
  },
  testnet: true,
})

// --- Minimal ABIs ---

const INVOICE_NFT_ABI = [
  {
    type: 'function' as const,
    name: 'getInvoice' as const,
    inputs: [{ name: 'tokenId', type: 'uint256' }] as const,
    outputs: [
      {
        name: '' as const,
        type: 'tuple' as const,
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'borrower', type: 'address' },
          { name: 'invoiceHash', type: 'bytes32' },
          { name: 'faceValueUSD', type: 'uint256' },
          { name: 'faceValueOriginal', type: 'uint256' },
          { name: 'originalCurrency', type: 'bytes3' },
          { name: 'dueDate', type: 'uint256' },
          { name: 'issuedDate', type: 'uint256' },
          { name: 'debtorHash', type: 'bytes32' },
          { name: 'qbInvoiceId', type: 'string' },
          { name: 'qbRealmId', type: 'string' },
          { name: 'discountRateBps', type: 'uint16' },
          { name: 'riskTier', type: 'uint8' },
          { name: 'maxLtvBps', type: 'uint16' },
          { name: 'isCollateralized', type: 'bool' },
          { name: 'isRepaid', type: 'bool' },
          { name: 'ipfsCID', type: 'string' },
          { name: 'legalAssignmentHash', type: 'bytes32' },
          { name: 'requestedAmount', type: 'uint256' },
        ] as const,
      },
    ] as const,
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'fulfillRisk' as const,
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'discountRateBps', type: 'uint16' },
      { name: 'riskTier', type: 'uint8' },
      { name: 'maxLtvBps', type: 'uint16' },
      { name: 'signature', type: 'bytes' },
    ] as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const,
  },
] as const

const CREDIT_REGISTRY_ABI = [
  {
    type: 'function' as const,
    name: 'getScore' as const,
    inputs: [{ name: 'borrower', type: 'address' }] as const,
    outputs: [{ name: '', type: 'uint8' }] as const,
    stateMutability: 'view' as const,
  },
] as const

// --- Risk scoring algorithm (matches CLAUDE.md spec) ---

function scoreRisk({
  daysToMaturity,
  debtorScore,
  borrowerScore,
  currency,
  hasExtraDocs,
}: {
  daysToMaturity: number
  debtorScore: number
  borrowerScore: number
  currency: string
  hasExtraDocs: boolean
}) {
  const FX_VOL: Record<string, number> = {
    NGN: 1800, KES: 1200, PHP: 600, BRL: 900,
    INR: 500, EUR: 300, GHS: 1500, EGP: 1400,
  }

  const baseBps = 50 + Math.min(Math.floor((daysToMaturity * 40) / 365), 400)
  const debtorAdj = Math.min((100 - debtorScore) * 3, 300)
  const fxAdj = Math.floor((FX_VOL[currency] || 800) / 4)
  const histDiscount = Math.min(borrowerScore * 2, 200)
  const docBonus = hasExtraDocs ? 50 : 0
  const raw = baseBps + debtorAdj + fxAdj - histDiscount - docBonus
  const discountBps = Math.max(50, Math.min(raw, 1500))

  const riskTier =
    discountBps < 200 ? 1 : discountBps < 400 ? 2 : discountBps < 700 ? 3 : discountBps < 1000 ? 4 : 5

  const maxLtvBps = discountBps < 200 ? 8500 : discountBps < 500 ? 8000 : discountBps < 900 ? 7500 : 7000

  return { discountBps, riskTier, maxLtvBps }
}

// --- Helpers ---

function bytes3ToString(bytes3Hex: string): string {
  const hex = bytes3Hex.replace(/^0x/, '').slice(0, 6)
  let str = ''
  for (let i = 0; i < 6; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16)
    if (code > 0) str += String.fromCharCode(code)
  }
  return str
}

async function signRawHash(messageHash: `0x${string}`, privateKey: string): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  // signMessage uses EIP-191 prefix which doesn't match what the contract expects (raw hash).
  // Use account.sign() which signs the raw hash directly.
  return account.sign({ hash: messageHash })
}

// --- API Route ---

export async function POST(request: NextRequest) {
  const privateKey = process.env.RISK_ENGINE_PRIVATE_KEY
  if (!privateKey) {
    return NextResponse.json({ error: 'RISK_ENGINE_PRIVATE_KEY not configured' }, { status: 500 })
  }

  let body: { tokenId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const tokenId = BigInt(body.tokenId)
  if (tokenId <= 0n) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
  }

  const invoiceNftAddress = deployments.contracts.InvoiceNFT as `0x${string}`
  const creditRegistryAddress = deployments.contracts.CreditScoreRegistry as `0x${string}`

  const publicClient = createPublicClient({
    chain: polkadotHubTestnet,
    transport: http(),
  })

  // 1. Read invoice
  let invoice: {
    borrower: `0x${string}`
    faceValueUSD: bigint
    dueDate: bigint
    originalCurrency: `0x${string}`
    riskTier: number
    legalAssignmentHash: `0x${string}`
  }
  try {
    invoice = await publicClient.readContract({
      address: invoiceNftAddress,
      abi: INVOICE_NFT_ABI,
      functionName: 'getInvoice',
      args: [tokenId],
    }) as typeof invoice
  } catch (err) {
    return NextResponse.json({ error: `Failed to read invoice: ${(err as Error).message}` }, { status: 500 })
  }

  // 2. Idempotency check
  if (invoice.riskTier > 0) {
    return NextResponse.json({ status: 'already_fulfilled', riskTier: invoice.riskTier })
  }

  // 3. Read borrower credit score
  let borrowerScore = 0
  try {
    borrowerScore = Number(
      await publicClient.readContract({
        address: creditRegistryAddress,
        abi: CREDIT_REGISTRY_ABI,
        functionName: 'getScore',
        args: [invoice.borrower],
      })
    )
  } catch {
    // Default to 0 if registry read fails
  }

  // 4. Compute risk
  const nowSec = Math.floor(Date.now() / 1000)
  const dueDateSec = Number(invoice.dueDate)
  const daysToMaturity = Math.max(0, Math.ceil((dueDateSec - nowSec) / 86400))
  const currency = bytes3ToString(invoice.originalCurrency as string)
  const debtorScore = 50 // default for unknown debtors
  const hasExtraDocs =
    invoice.legalAssignmentHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'

  const risk = scoreRisk({ daysToMaturity, debtorScore, borrowerScore, currency, hasExtraDocs })

  // 5. Sign
  const messageHash = keccak256(
    encodePacked(
      ['uint256', 'uint16', 'uint8', 'uint16'],
      [tokenId, risk.discountBps, risk.riskTier, risk.maxLtvBps]
    )
  )
  const signature = await signRawHash(messageHash, privateKey)

  // 6. Submit fulfillRisk tx
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const walletClient = createWalletClient({
    account,
    chain: polkadotHubTestnet,
    transport: http(),
  })

  try {
    const txHash = await walletClient.writeContract({
      address: invoiceNftAddress,
      abi: INVOICE_NFT_ABI,
      functionName: 'fulfillRisk',
      args: [tokenId, risk.discountBps, risk.riskTier, risk.maxLtvBps, signature],
      gasPrice: 1_000_000_000_000n,
    })

    console.log(`[risk-engine] Token ${tokenId}: submitted tx ${txHash} (tier=${risk.riskTier}, bps=${risk.discountBps})`)

    return NextResponse.json({
      status: 'submitted',
      txHash,
      discountBps: risk.discountBps,
      riskTier: risk.riskTier,
      maxLtvBps: risk.maxLtvBps,
    })
  } catch (err) {
    console.error(`[risk-engine] fulfillRisk failed for token ${tokenId}:`, (err as Error).message)
    return NextResponse.json({ error: `fulfillRisk failed: ${(err as Error).message}` }, { status: 500 })
  }
}
