import type { OnChainLoan, OnChainInvoice } from '@/lib/invoicefi/types'

/**
 * Parse raw loan data from wagmi/viem useReadContract.
 *
 * Solidity `mapping(uint256 => Loan) public loans` getters return a flat tuple
 * (array) via wagmi/viem, not a named object. This function handles both formats.
 *
 * Tuple order: [tokenId, borrower, totalFunded, maxFundable, discountRateBps,
 *               openedAt, dueDate, active, defaulted, positionCount]
 */
export function parseLoan(raw: unknown): OnChainLoan | null {
  if (!raw) return null

  if (Array.isArray(raw)) {
    return {
      tokenId: raw[0] as bigint,
      borrower: raw[1] as `0x${string}`,
      totalFunded: raw[2] as bigint,
      maxFundable: raw[3] as bigint,
      discountRateBps: raw[4] as bigint,
      openedAt: raw[5] as bigint,
      dueDate: raw[6] as bigint,
      active: raw[7] as boolean,
      defaulted: raw[8] as boolean,
      positionCount: raw[9] as bigint,
    }
  }

  // Already a named object (e.g. from a view function returning a struct)
  return raw as OnChainLoan
}

/**
 * Parse raw invoice data from wagmi/viem useReadContract.
 *
 * `getInvoice()` returns `InvoiceData memory` — viem may return it as a named
 * object or a tuple depending on ABI encoding. This handles both.
 *
 * Tuple order: [tokenId, borrower, invoiceHash, faceValueUSD, faceValueOriginal,
 *               originalCurrency, dueDate, issuedDate, debtorHash, qbInvoiceId,
 *               qbRealmId, discountRateBps, riskTier, maxLtvBps, isCollateralized,
 *               isRepaid, ipfsCID, legalAssignmentHash, requestedAmount]
 */
export function parseInvoice(raw: unknown): OnChainInvoice | null {
  if (!raw) return null

  if (Array.isArray(raw)) {
    return {
      tokenId: raw[0] as bigint,
      borrower: raw[1] as `0x${string}`,
      invoiceHash: raw[2] as `0x${string}`,
      faceValueUSD: raw[3] as bigint,
      faceValueOriginal: raw[4] as bigint,
      originalCurrency: raw[5] as string,
      dueDate: raw[6] as bigint,
      issuedDate: raw[7] as bigint,
      debtorHash: raw[8] as `0x${string}`,
      qbInvoiceId: raw[9] as string,
      qbRealmId: raw[10] as string,
      discountRateBps: Number(raw[11]),
      riskTier: Number(raw[12]),
      maxLtvBps: Number(raw[13]),
      isCollateralized: raw[14] as boolean,
      isRepaid: raw[15] as boolean,
      ipfsCID: raw[16] as string,
      legalAssignmentHash: raw[17] as `0x${string}`,
      requestedAmount: raw[18] as bigint,
    }
  }

  // Already a named object
  return raw as OnChainInvoice
}
