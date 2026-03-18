require("dotenv").config({ path: __dirname + "/.env" });

const {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  keccak256,
  encodePacked,
  toBytes,
  toHex,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { secp256k1 } = require("@noble/curves/secp256k1");

// --- Configuration ---

const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("ERROR: PRIVATE_KEY not set in scripts/.env");
  process.exit(1);
}

const INVOICE_NFT_ADDRESS = "0x4d0884D03f2fA409370D0F97c6AbC4dA4A8F03d6";
const CREDIT_REGISTRY_ADDRESS = "0xfBF2a9f8ffab5a8ED186151d9CFa360911Abd6Fd";

const polkadotHubTestnet = defineChain({
  id: 420420417,
  name: "Polkadot Hub Testnet",
  nativeCurrency: { name: "WND", symbol: "WND", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io/"] },
  },
  testnet: true,
});

// --- ABIs (only the functions we need) ---

const INVOICE_NFT_ABI = [
  {
    type: "function",
    name: "getInvoice",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "borrower", type: "address" },
          { name: "invoiceHash", type: "bytes32" },
          { name: "faceValueUSD", type: "uint256" },
          { name: "faceValueOriginal", type: "uint256" },
          { name: "originalCurrency", type: "bytes3" },
          { name: "dueDate", type: "uint256" },
          { name: "issuedDate", type: "uint256" },
          { name: "debtorHash", type: "bytes32" },
          { name: "qbInvoiceId", type: "string" },
          { name: "qbRealmId", type: "string" },
          { name: "discountRateBps", type: "uint16" },
          { name: "riskTier", type: "uint8" },
          { name: "maxLtvBps", type: "uint16" },
          { name: "isCollateralized", type: "bool" },
          { name: "isRepaid", type: "bool" },
          { name: "ipfsCID", type: "string" },
          { name: "legalAssignmentHash", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fulfillRisk",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "discountRateBps", type: "uint16" },
      { name: "riskTier", type: "uint8" },
      { name: "maxLtvBps", type: "uint16" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const CREDIT_REGISTRY_ABI = [
  {
    type: "function",
    name: "getScore",
    inputs: [{ name: "borrower", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
];

// --- Risk Scoring Algorithm ---

function scoreRisk({ daysToMaturity, debtorScore, borrowerScore, currency, hasExtraDocs }) {
  const FX_VOL = {
    NGN: 1800, KES: 1200, PHP: 600, BRL: 900,
    INR: 500, EUR: 300, GHS: 1500, EGP: 1400,
  };

  const baseBps = 50 + Math.min(Math.floor(daysToMaturity * 40 / 365), 400);
  const debtorAdj = Math.min((100 - debtorScore) * 3, 300);
  const fxAdj = Math.floor((FX_VOL[currency] || 800) / 4);
  const histDiscount = Math.min(borrowerScore * 2, 200);
  const docBonus = hasExtraDocs ? 50 : 0;
  const raw = baseBps + debtorAdj + fxAdj - histDiscount - docBonus;
  const discountBps = Math.max(50, Math.min(raw, 1500));

  const riskTier = discountBps < 200 ? 1
    : discountBps < 400 ? 2
    : discountBps < 700 ? 3
    : discountBps < 1000 ? 4
    : 5;

  const maxLtvBps = discountBps < 200 ? 8500
    : discountBps < 500 ? 8000
    : discountBps < 900 ? 7500
    : 7000;

  return { discountBps, riskTier, maxLtvBps };
}

// --- Helpers ---

/** Decode bytes3 hex to 3-letter currency string */
function bytes3ToString(bytes3Hex) {
  // bytes3 is 6 hex chars (after 0x prefix), decode as ASCII
  const hex = bytes3Hex.replace(/^0x/, "").slice(0, 6);
  let str = "";
  for (let i = 0; i < 6; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code > 0) str += String.fromCharCode(code);
  }
  return str;
}

/**
 * Sign a raw keccak256 hash with secp256k1 (NO EIP-191 prefix).
 * Returns a 65-byte 0x-prefixed signature (r + s + v).
 */
function signRawHash(messageHash, privateKey) {
  const hashBytes = toBytes(messageHash);
  const privKeyHex = privateKey.replace(/^0x/, "");
  const privKeyBytes = Uint8Array.from(Buffer.from(privKeyHex, "hex"));

  const sig = secp256k1.sign(hashBytes, privKeyBytes);

  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const v = sig.recovery + 27;

  return "0x" + r + s + v.toString(16).padStart(2, "0");
}

// --- Main ---

async function main() {
  const tokenIdArg = process.argv[2];
  if (!tokenIdArg) {
    console.error("Usage: node risk-engine.js <tokenId>");
    console.error("Example: node risk-engine.js 1");
    process.exit(1);
  }

  const tokenId = BigInt(tokenIdArg);
  console.log(`=== Sprout Risk Engine ===\n`);
  console.log(`Processing token ID: ${tokenId}\n`);

  // Set up clients
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Signer address: ${account.address}`);

  const publicClient = createPublicClient({
    chain: polkadotHubTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: polkadotHubTestnet,
    transport: http(),
  });

  // 1. Read invoice data from chain
  console.log("\n1. Reading invoice data from InvoiceNFT...");
  let invoice;
  try {
    invoice = await publicClient.readContract({
      address: INVOICE_NFT_ADDRESS,
      abi: INVOICE_NFT_ABI,
      functionName: "getInvoice",
      args: [tokenId],
    });
  } catch (err) {
    console.error(`Failed to read invoice for token ${tokenId}:`, err.message);
    process.exit(1);
  }

  console.log(`  Borrower: ${invoice.borrower}`);
  console.log(`  Face Value USD: ${invoice.faceValueUSD} (raw, 18 decimals)`);
  console.log(`  Due Date: ${new Date(Number(invoice.dueDate) * 1000).toISOString()}`);
  console.log(`  Original Currency (bytes3): ${invoice.originalCurrency}`);

  // Check if already fulfilled
  if (invoice.riskTier > 0) {
    console.log(`\nInvoice already has risk data (riskTier=${invoice.riskTier}). Exiting.`);
    process.exit(0);
  }

  // 2. Read borrower credit score
  console.log("\n2. Reading borrower credit score...");
  let borrowerScore;
  try {
    borrowerScore = await publicClient.readContract({
      address: CREDIT_REGISTRY_ADDRESS,
      abi: CREDIT_REGISTRY_ABI,
      functionName: "getScore",
      args: [invoice.borrower],
    });
  } catch (err) {
    console.warn(`  Warning: Could not read credit score: ${err.message}`);
    console.warn("  Defaulting borrower score to 0");
    borrowerScore = 0;
  }
  console.log(`  Borrower score: ${borrowerScore}`);

  // 3. Compute daysToMaturity
  const nowSec = Math.floor(Date.now() / 1000);
  const dueDateSec = Number(invoice.dueDate);
  const daysToMaturity = Math.max(0, Math.ceil((dueDateSec - nowSec) / 86400));
  console.log(`\n3. Days to maturity: ${daysToMaturity}`);

  // 4. Decode originalCurrency from bytes3
  const currency = bytes3ToString(invoice.originalCurrency);
  console.log(`4. Currency: ${currency}`);

  // 5. Run risk algorithm
  // debtorScore defaults to 50 (unknown debtor) since we only have borrower on-chain
  const debtorScore = 50;
  const hasExtraDocs = invoice.legalAssignmentHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  const riskResult = scoreRisk({
    daysToMaturity,
    debtorScore,
    borrowerScore: Number(borrowerScore),
    currency,
    hasExtraDocs,
  });

  console.log(`\n5. Risk scoring result:`);
  console.log(`  Discount Rate: ${riskResult.discountBps} bps (${(riskResult.discountBps / 100).toFixed(2)}%)`);
  console.log(`  Risk Tier: ${riskResult.riskTier}`);
  console.log(`  Max LTV: ${riskResult.maxLtvBps} bps (${(riskResult.maxLtvBps / 100).toFixed(2)}%)`);

  // 6. Sign the raw hash (NO EIP-191 prefix)
  console.log("\n6. Signing risk data...");
  const messageHash = keccak256(
    encodePacked(
      ["uint256", "uint16", "uint8", "uint16"],
      [tokenId, riskResult.discountBps, riskResult.riskTier, riskResult.maxLtvBps]
    )
  );
  console.log(`  Message hash: ${messageHash}`);

  const signature = signRawHash(messageHash, PRIVATE_KEY);
  console.log(`  Signature: ${signature}`);

  // 7. Call fulfillRisk()
  console.log("\n7. Calling InvoiceNFT.fulfillRisk()...");
  try {
    const txHash = await walletClient.writeContract({
      address: INVOICE_NFT_ADDRESS,
      abi: INVOICE_NFT_ABI,
      functionName: "fulfillRisk",
      args: [tokenId, riskResult.discountBps, riskResult.riskTier, riskResult.maxLtvBps, signature],
      gasPrice: 1_000_000_000_000n,
    });

    console.log(`  Transaction submitted: ${txHash}`);
    console.log("  Waiting for confirmation (polling contract state)...");

    // pallet_revive: waitForTransactionReceipt hangs, so poll contract state instead
    let confirmed = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const updated = await publicClient.readContract({
          address: INVOICE_NFT_ADDRESS,
          abi: INVOICE_NFT_ABI,
          functionName: "getInvoice",
          args: [tokenId],
        });
        if (updated.riskTier > 0) {
          console.log(`  Confirmed! riskTier=${updated.riskTier}, discountRateBps=${updated.discountRateBps}`);
          confirmed = true;
          break;
        }
      } catch {}
      console.log(`  Polling... (attempt ${i + 1})`);
    }

    if (!confirmed) {
      console.error("  Timed out waiting for confirmation. Check tx:", txHash);
      process.exit(1);
    }
  } catch (err) {
    console.error(`  fulfillRisk() failed: ${err.message}`);
    process.exit(1);
  }

  // 8. Summary
  console.log("\n=== Risk Engine Complete ===");
  console.log(`Token ID ${tokenId} fulfilled with:`);
  console.log(`  Discount Rate: ${riskResult.discountBps} bps`);
  console.log(`  Risk Tier: ${riskResult.riskTier}`);
  console.log(`  Max LTV: ${riskResult.maxLtvBps} bps`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
