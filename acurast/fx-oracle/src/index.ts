/**
 * Sprout Finance — Acurast FX Oracle
 *
 * Scheduled every 5 minutes on Acurast Canary.
 * Fetches live USD exchange rates from ExchangeRate-API v6 and pushes them
 * to FXOracle.sol on Westend Hub via Ethereum fulfill.
 *
 * Env vars (encrypted in Acurast TEE, set in .env + acurast.json includeEnvironmentVariables):
 *   FX_API_KEY      — ExchangeRate-API v6 key
 *   HUB_RPC         — Westend Hub RPC URL
 *   ORACLE_CONTRACT — FXOracle.sol deployed address
 */

declare const _STD_: {
  chains: {
    ethereum: {
      fulfill: (
        url: string,
        destination: string,
        payload: string,
        extra: { methodSignature?: string; gasLimit?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string },
        onSuccess: (opHash: string) => void,
        onError: (err: string) => void
      ) => void;
      getAddress: () => string;
    };
  };
  job: {
    getPublicKeys: () => { p256: string; secp256k1: string; ed25519: string };
  };
  env: Record<string, string>;
};
declare function httpGET(url: string, headers: Record<string, string>, onSuccess: (resp: string) => void, onError: (err: string) => void): void;
declare function httpPOST(url: string, body: string, headers: Record<string, string>, onSuccess: (resp: string) => void, onError: (err: string) => void): void;

const CURRENCIES = ["NGN", "PHP", "KES", "BRL", "GHS", "INR", "EGP", "EUR"] as const;
const RATE_DECIMALS = 1e8; // 8 decimal places per spec

// ABI encoding helpers — payload for ethereum.fulfill is args-only (no selector)

function toBytes3Hex(currency: string): string {
  // bytes3 in ABI: left-aligned, right-padded to 32 bytes
  const bytes = Array.from(currency).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"));
  return bytes.join("") + "00".repeat(29);
}

function toUint256Hex(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/**
 * ABI encode arguments for updateRates(bytes3[], uint256[]) — no function selector.
 * ethereum.fulfill prepends the selector based on extra.methodSignature.
 */
function encodeUpdateRatesArgs(currencies: string[], rates: bigint[]): string {
  const count = currencies.length;
  // Dynamic types: two offsets (64 bytes each), then each array
  const currenciesOffset = "0000000000000000000000000000000000000000000000000000000000000040"; // 64
  const ratesOffset = (64 + 32 + count * 32).toString(16).padStart(64, "0");
  const countHex = count.toString(16).padStart(64, "0");
  const currenciesEncoded = currencies.map(toBytes3Hex).join("");
  const ratesEncoded = rates.map(toUint256Hex).join("");

  return currenciesOffset + ratesOffset + countHex + currenciesEncoded + countHex + ratesEncoded;
}

function main() {
  // Report processor ETH address on every run (visible in Acurast console logs)
  try {
    const processorAddr = _STD_.chains.ethereum.getAddress();
    const pubKeys = _STD_.job.getPublicKeys();
    console.log("PROCESSOR_ETH_ADDRESS=" + processorAddr);
    console.log("PROCESSOR_SECP256K1_PUBKEY=" + pubKeys.secp256k1);
  } catch (e) {
    console.warn("Could not get processor address:", e);
  }

  const apiKey = _STD_.env["FX_API_KEY"];
  const hubRpc = _STD_.env["HUB_RPC"];
  const oracleContract = _STD_.env["ORACLE_CONTRACT"];

  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;

  httpGET(
    url,
    { Accept: "application/json" },
    (responseText: string) => {
      let response: { result: string; conversion_rates: Record<string, number> };
      try {
        response = JSON.parse(responseText);
      } catch {
        console.error("Failed to parse FX API response");
        return;
      }

      if (response.result !== "success") {
        console.error("FX API returned non-success result:", response.result);
        return;
      }

      const rates = response.conversion_rates;

      const selectedCurrencies: string[] = [];
      const selectedRates: bigint[] = [];

      for (const currency of CURRENCIES) {
        const rate = rates[currency];
        if (rate == null || rate <= 0) {
          console.warn(`Missing or invalid rate for ${currency}, skipping`);
          continue;
        }
        const rateScaled = BigInt(Math.round(rate * RATE_DECIMALS));
        selectedCurrencies.push(currency);
        selectedRates.push(rateScaled);
      }

      if (selectedCurrencies.length === 0) {
        console.error("No valid rates found");
        return;
      }

      console.log(`Pushing ${selectedCurrencies.length} rates to FXOracle on Westend Hub`);

      // Payload = ABI-encoded arguments only (no selector)
      // ethereum.fulfill prepends selector from methodSignature
      const payload = encodeUpdateRatesArgs(selectedCurrencies, selectedRates);

      _STD_.chains.ethereum.fulfill(
        hubRpc,
        oracleContract,
        payload,
        {
          methodSignature: "updateRates(bytes3[],uint256[])",
          gasLimit: "9000000",
        },
        (opHash: string) => {
          console.log("FX rates submitted. TxHash:", opHash, "Currencies:", selectedCurrencies.join(", "));
        },
        (err: string) => {
          console.error("Failed to submit FX rates:", err);
        }
      );
    },
    (err: string) => {
      console.error("HTTP request to FX API failed:", err);
    }
  );
}

main();
