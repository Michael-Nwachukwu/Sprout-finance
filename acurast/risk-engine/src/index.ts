/**
 * Sprout Finance — Acurast Risk Engine
 *
 * On-demand deployment triggered once per invoice submission.
 * Verifies QB invoice → scores risk → signs result → calls InvoiceNFT.fulfillRisk()
 *
 * Env vars (encrypted per-job in Acurast TEE, set in .env + acurast.json includeEnvironmentVariables):
 *   TOKEN_ID         — pending token ID from requestMint()
 *   QB_REALM_ID      — QuickBooks company realm ID
 *   QB_INVOICE_ID    — QuickBooks Invoice.Id
 *   QB_ACCESS_TOKEN  — OAuth access token
 *   CURRENCY         — ISO 4217 currency code (e.g. "NGN")
 *   DAYS_TO_MATURITY — days until invoice due date
 *   DEBTOR_SCORE     — debtor history score from CreditScoreRegistry (0-100)
 *   BORROWER_SCORE   — borrower credit score from CreditScoreRegistry (0-100)
 *   NFT_CONTRACT     — InvoiceNFT.sol deployed address
 *   HUB_RPC          — Westend Hub RPC URL
 */

import { keccak256 } from "ethereum-cryptography/keccak";

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
    };
  };
  signers: {
    secp256k1: {
      sign: (payload: string) => string; // synchronous — returns hex signature directly
    };
  };
  env: Record<string, string>;
};
declare function httpGET(url: string, headers: Record<string, string>, onSuccess: (resp: string) => void, onError: (err: string) => void): void;

// ─── Risk Scoring Algorithm ────────────────────────────────────────────────

interface RiskParams {
  daysToMaturity: number;
  debtorScore: number;
  borrowerScore: number;
  currency: string;
  hasExtraDocs: boolean;
}

interface RiskResult {
  discountBps: number;
  riskTier: number;
  maxLtvBps: number;
}

const FX_VOL: Record<string, number> = {
  NGN: 1800, KES: 1200, PHP: 600, BRL: 900, INR: 500,
  EUR: 300, GHS: 1500, EGP: 1400,
};

function scoreRisk(params: RiskParams): RiskResult {
  const { daysToMaturity, debtorScore, borrowerScore, currency, hasExtraDocs } = params;
  const baseBps = 50 + Math.min(Math.floor(daysToMaturity * 40 / 365), 400);
  const debtorAdj = Math.min((100 - debtorScore) * 3, 300);
  const fxAdj = Math.floor((FX_VOL[currency] ?? 800) / 4);
  const histDiscount = Math.min(borrowerScore * 2, 200);
  const docBonus = hasExtraDocs ? 50 : 0;
  const raw = baseBps + debtorAdj + fxAdj - histDiscount - docBonus;
  const discountBps = Math.max(50, Math.min(raw, 1500));
  const riskTier =
    discountBps < 200 ? 1 :
    discountBps < 400 ? 2 :
    discountBps < 700 ? 3 :
    discountBps < 1000 ? 4 : 5;
  const maxLtvBps =
    discountBps < 200 ? 8500 :
    discountBps < 500 ? 8000 :
    discountBps < 900 ? 7500 : 7000;
  return { discountBps, riskTier, maxLtvBps };
}

// ─── ABI Encoding ─────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toUint256Hex(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function toUint16Hex(n: number): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

function toUint8Hex(n: number): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

/**
 * ABI encode arguments for fulfillRisk(uint256,uint16,uint8,uint16,bytes) — no selector.
 * ethereum.fulfill prepends selector from extra.methodSignature.
 */
function encodeFulfillRiskArgs(
  tokenId: bigint,
  discountBps: number,
  riskTier: number,
  maxLtvBps: number,
  signature: string // hex string (with or without 0x), 65 bytes = 130 hex chars
): string {
  const sigHex = signature.replace("0x", "");
  const sigBytes = sigHex.length / 2;
  // bytes param offset: 4 static params * 32 bytes = 128
  const bytesOffset = (128).toString(16).padStart(64, "0");
  const bytesLength = sigBytes.toString(16).padStart(64, "0");
  const sigPadded = sigHex.padEnd(Math.ceil(sigBytes / 32) * 32 * 2, "0");

  return (
    toUint256Hex(tokenId) +
    toUint16Hex(discountBps) +
    toUint8Hex(riskTier) +
    toUint16Hex(maxLtvBps) +
    bytesOffset +
    bytesLength +
    sigPadded
  );
}

/**
 * Compute keccak256(abi.encodePacked(tokenId, discountBps, riskTier, maxLtvBps))
 * This must match what InvoiceNFT.fulfillRisk() verifies on-chain.
 * uint256 = 32 bytes, uint16 = 2 bytes, uint8 = 1 byte, uint16 = 2 bytes
 */
function buildMessageHash(tokenId: bigint, discountBps: number, riskTier: number, maxLtvBps: number): string {
  const packed =
    tokenId.toString(16).padStart(64, "0") +
    discountBps.toString(16).padStart(4, "0") +
    riskTier.toString(16).padStart(2, "0") +
    maxLtvBps.toString(16).padStart(4, "0");
  return bytesToHex(keccak256(hexToBytes(packed)));
}

// ─── QB Verification ──────────────────────────────────────────────────────

interface QBInvoice {
  Id: string;
  Balance: number;
  TotalAmt: number;
  DueDate: string;
  CurrencyRef?: { value: string };
  Line?: unknown[];
}

function verifyInvoice(
  qbRealmId: string,
  qbInvoiceId: string,
  accessToken: string,
  onSuccess: (invoice: QBInvoice) => void,
  onError: (err: string) => void
): void {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${qbRealmId}/invoice/${qbInvoiceId}?minorversion=65`;
  httpGET(
    url,
    {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    (responseText: string) => {
      let data: { Invoice?: QBInvoice; Fault?: { Error?: Array<{ Message?: string }> } };
      try {
        data = JSON.parse(responseText);
      } catch {
        onError("Failed to parse QB response");
        return;
      }
      if (data.Fault) {
        onError(`QB API error: ${data.Fault.Error?.[0]?.Message ?? "unknown"}`);
        return;
      }
      if (!data.Invoice) {
        onError("Invoice not found in QB response");
        return;
      }
      if (data.Invoice.Balance <= 0) {
        onError("Invoice has zero balance — already paid");
        return;
      }
      onSuccess(data.Invoice);
    },
    onError
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main() {
  const tokenId = BigInt(_STD_.env["TOKEN_ID"]);
  const qbRealmId = _STD_.env["QB_REALM_ID"];
  const qbInvoiceId = _STD_.env["QB_INVOICE_ID"];
  const qbAccessToken = _STD_.env["QB_ACCESS_TOKEN"];
  const currency = _STD_.env["CURRENCY"];
  const daysToMaturity = parseInt(_STD_.env["DAYS_TO_MATURITY"], 10);
  const debtorScore = parseInt(_STD_.env["DEBTOR_SCORE"], 10);
  const borrowerScore = parseInt(_STD_.env["BORROWER_SCORE"], 10);
  const nftContract = _STD_.env["NFT_CONTRACT"];
  const hubRpc = _STD_.env["HUB_RPC"];

  // Step 1: Verify invoice on QuickBooks
  verifyInvoice(
    qbRealmId,
    qbInvoiceId,
    qbAccessToken,
    (invoice: QBInvoice) => {
      console.log(`QB Invoice verified: ${invoice.Id}, Balance: ${invoice.Balance}`);

      // Step 2: Score risk
      const risk = scoreRisk({
        daysToMaturity,
        debtorScore,
        borrowerScore,
        currency,
        hasExtraDocs: false,
      });

      console.log(`Risk scored: discountBps=${risk.discountBps}, tier=${risk.riskTier}, maxLtv=${risk.maxLtvBps}`);

      // Step 3: Build 32-byte message hash = keccak256(abi.encodePacked(tokenId, discountBps, riskTier, maxLtvBps))
      // InvoiceNFT.fulfillRisk() recovers signer from this same hash — must match exactly.
      const messageHash = buildMessageHash(tokenId, risk.discountBps, risk.riskTier, risk.maxLtvBps);

      // Step 4: Sign the 32-byte hash with TEE secp256k1 key (synchronous, no Ethereum prefix added)
      let signature: string;
      try {
        signature = _STD_.signers.secp256k1.sign(messageHash);
      } catch (e) {
        console.error("Signing failed:", e);
        return;
      }

      console.log("Signature obtained from TEE");

      // Step 5: Submit fulfillRisk on-chain via Westend Hub EVM
      const payload = encodeFulfillRiskArgs(
        tokenId,
        risk.discountBps,
        risk.riskTier,
        risk.maxLtvBps,
        signature
      );

      _STD_.chains.ethereum.fulfill(
        hubRpc,
        nftContract,
        payload,
        {
          methodSignature: "fulfillRisk(uint256,uint16,uint8,uint16,bytes)",
          gasLimit: "9000000",
        },
        (opHash: string) => {
          console.log(`fulfillRisk submitted for token ${tokenId}. TxHash:`, opHash);
        },
        (err: string) => {
          console.error("Failed to submit fulfillRisk:", err);
        }
      );
    },
    (err: string) => {
      console.error("QB invoice verification failed:", err);
    }
  );
}

main();
