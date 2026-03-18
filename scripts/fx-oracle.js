require("dotenv").config({ path: __dirname + "/.env" });

const {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  toHex,
  encodeFunctionData,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

// --- Configuration ---

const FX_API_KEY = process.env.FX_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!FX_API_KEY) {
  console.error("ERROR: FX_API_KEY not set in .env");
  process.exit(1);
}
if (!PRIVATE_KEY) {
  console.error("ERROR: PRIVATE_KEY not set in .env");
  process.exit(1);
}

const FX_ORACLE_ADDRESS = "0xE9b224bE25B2823250f4545709A11e8ebAC18b34";

const CURRENCIES = ["NGN", "PHP", "KES", "BRL", "GHS", "INR", "EGP", "EUR"];

const polkadotHubTestnet = defineChain({
  id: 420420417,
  name: "Polkadot Hub Testnet",
  nativeCurrency: { name: "WND", symbol: "WND", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io/"] },
  },
  testnet: true,
});

const FX_ORACLE_ABI = [
  {
    type: "function",
    name: "updateRates",
    inputs: [
      { name: "currencies", type: "bytes3[]", internalType: "bytes3[]" },
      { name: "_rates", type: "uint256[]", internalType: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

// --- Helpers ---

/** Convert a 3-letter ISO currency code to bytes3 hex */
function currencyToBytes3(code) {
  return toHex(new TextEncoder().encode(code), { size: 3 });
}

// --- Main ---

async function main() {
  console.log("=== Sprout FX Oracle Script ===\n");

  // 1. Fetch rates from ExchangeRate-API
  const apiUrl = `https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/USD`;
  console.log("Fetching USD exchange rates...");

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`ExchangeRate-API returned HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.result !== "success") {
    throw new Error(`ExchangeRate-API error: ${data["error-type"] || "unknown"}`);
  }

  const conversionRates = data.conversion_rates;

  // 2. Extract and scale rates (8 decimals)
  const currencyBytes = [];
  const rateValues = [];

  console.log("\nRates fetched (USD base):");
  for (const code of CURRENCIES) {
    const rate = conversionRates[code];
    if (rate === undefined) {
      throw new Error(`Currency ${code} not found in API response`);
    }
    const scaledRate = BigInt(Math.round(rate * 1e8));
    currencyBytes.push(currencyToBytes3(code));
    rateValues.push(scaledRate);
    console.log(`  ${code}: ${rate} -> ${scaledRate.toString()} (x1e8)`);
  }

  // 3. Send transaction
  console.log("\nPreparing transaction...");

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Sender: ${account.address}`);

  const publicClient = createPublicClient({
    chain: polkadotHubTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: polkadotHubTestnet,
    transport: http(),
  });

  console.log(`Target: FXOracle @ ${FX_ORACLE_ADDRESS}`);
  console.log("Sending updateRates()...");

  const txHash = await walletClient.writeContract({
    address: FX_ORACLE_ADDRESS,
    abi: FX_ORACLE_ABI,
    functionName: "updateRates",
    args: [currencyBytes, rateValues],
  });

  console.log(`\nTransaction submitted: ${txHash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    console.log(`\nTransaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    console.log("\nAll rates updated successfully.");
  } else {
    console.error("\nTransaction REVERTED.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err.message || err);
  process.exit(1);
});
