// Legal assignment template generator + types for World ID signing

export interface LegalAssignmentDocument {
  type: 'legal-assignment'
  version: '1.0'
  generatedAt: string
  borrowerAddress: `0x${string}`
  invoice: {
    qbInvoiceId: string
    debtorName: string
    faceValueUSD: number
    originalCurrency: string
    dueDate: string
  }
  assignmentClause: string
  worldIdProof?: WorldIdProofData
}

export interface WorldIdProofData {
  nullifier: string
  merkle_root: string
  proof: string
  verification_level: string
  action: string
  verified_at: string
}

const ASSIGNMENT_CLAUSE = `The undersigned hereby irrevocably assigns, transfers, and conveys all rights, title, and interest in the invoice receivable described above to the Sprout Finance Lending Pool smart contract on the Polkadot Hub EVM network. This assignment includes the right to receive all payments due under the invoice and to enforce collection thereof. The undersigned warrants that (a) they are the lawful holder of the receivable, (b) the receivable is free from liens and encumbrances, (c) the invoice data provided is accurate and complete, and (d) the debtor has not disputed the amounts due. This digital assignment is signed using World ID zero-knowledge proof, providing cryptographic attestation of the signer's unique identity without revealing personal information.`

export function generateLegalAssignment(
  invoice: {
    Id: string
    CustomerRef: { name: string }
    TotalAmt: number
    CurrencyRef: { value: string }
    DueDate: string
  },
  borrowerAddress: `0x${string}`
): LegalAssignmentDocument {
  return {
    type: 'legal-assignment',
    version: '1.0',
    generatedAt: new Date().toISOString(),
    borrowerAddress,
    invoice: {
      qbInvoiceId: invoice.Id,
      debtorName: invoice.CustomerRef.name,
      faceValueUSD: invoice.TotalAmt,
      originalCurrency: invoice.CurrencyRef.value,
      dueDate: invoice.DueDate,
    },
    assignmentClause: ASSIGNMENT_CLAUSE,
  }
}
