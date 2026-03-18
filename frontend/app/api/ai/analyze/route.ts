import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AIAnalysisResult } from '@/lib/invoicefi/types'

const GEMINI_MODEL = 'gemini-2.5-flash'

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  let body: {
    invoiceData: Record<string, unknown>
    supportingDocs?: { name: string; type: string; base64: string }[]
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { invoiceData, supportingDocs } = body

  if (!invoiceData) {
    return NextResponse.json({ error: 'invoiceData is required' }, { status: 400 })
  }

  const genAI = new GoogleGenerativeAI(apiKey)

  try {
    // Step 1: Invoice authenticity + fraud analysis
    const analysisModel = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const invoiceSummary = buildInvoiceSummary(invoiceData)
    const docDescriptions = supportingDocs?.map((d) => `- ${d.name} (${d.type})`).join('\n') ?? 'None provided'

    // Build parts array for multimodal analysis
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

    parts.push({
      text: `You are a financial risk analyst for an invoice financing platform. Analyze the following invoice data and supporting documents for authenticity, fraud indicators, and cross-reference consistency.

## Invoice Data
${invoiceSummary}

## Supporting Documents Provided
${docDescriptions}

${supportingDocs && supportingDocs.length > 0 ? 'The supporting documents are attached as images/PDFs below. Analyze them carefully.' : 'No supporting documents were provided for cross-referencing.'}

Respond in STRICT JSON format (no markdown, no code fences) with this exact structure:
{
  "authenticity": {
    "score": <number 0-100>,
    "flags": [<array of concern strings, empty if none>],
    "summary": "<1-2 sentence assessment>"
  },
  "crossReference": {
    "matched": <boolean>,
    "discrepancies": [<array of discrepancy strings, empty if none>],
    "summary": "<1-2 sentence assessment>"
  },
  "fraudIndicators": {
    "riskLevel": "<low|medium|high>",
    "flags": [<array of fraud concern strings, empty if none>],
    "summary": "<1-2 sentence assessment>"
  },
  "overallSummary": "<2-3 sentence lender-facing summary>",
  "recommendation": "<proceed|caution|reject>"
}

IMPORTANT CONTEXT about this platform:
- This is an invoice financing platform for emerging markets. Invoices are issued in LOCAL currencies (KES, NGN, PHP, BRL, etc.) but the "Face Value (USD)" shown is the USD-equivalent amount for financing purposes, converted at market exchange rates. This dual-currency presentation is NORMAL and expected — it is NOT a currency mismatch or inconsistency.
- The invoice total in local currency and the USD equivalent should be roughly consistent with prevailing exchange rates.
- Delivery notes / Bills of Lading may show "Pending" receipt status if goods are in transit — this is normal for pre-shipment or in-transit invoice financing and should NOT be treated as a fraud indicator.
- Logistics / freight charges appearing on an invoice but not on the PO is common in trade finance — the PO covers goods, while the invoice includes additional delivery costs. This is a minor discrepancy at most, not a rejection-worthy issue.
- The PO subtotal may differ from the invoice total because the invoice includes VAT/tax and logistics that the PO does not cover.

Be thorough but fair. Flag genuine concerns, not hypothetical ones. Consider:
- Date consistency (invoice date should be before/on due date, PO before invoice, BoL around invoice date)
- Amount consistency across documents (allowing for tax/freight additions on invoice vs PO)
- Company name consistency across documents
- Reasonable payment terms (30-120 days typical)
- Round number patterns (common in fraud)
- Document formatting quality
- Whether the core goods/services and quantities match across PO, invoice, and BoL`,
    })

    // Attach supporting documents as inline data
    if (supportingDocs && supportingDocs.length > 0) {
      for (const doc of supportingDocs) {
        const mimeType = doc.type || 'application/pdf'
        parts.push({
          inlineData: {
            mimeType,
            data: doc.base64,
          },
        })
      }
    }

    const analysisResult = await analysisModel.generateContent(parts)
    const analysisText = analysisResult.response.text()
    const analysis = parseJsonResponse(analysisText)

    // Step 2: Company due diligence with Google Search grounding
    const companyName = extractCompanyName(invoiceData)
    let companyDueDiligence = {
      companyName: companyName || 'Unknown',
      industry: 'Unknown',
      riskFactors: [] as string[],
      publicInfo: 'No public information available.',
      summary: 'Unable to perform company due diligence — no company name available.',
    }

    if (companyName) {
      try {
        const searchModel = genAI.getGenerativeModel({
          model: GEMINI_MODEL,
          tools: [{ googleSearch: {} } as never],
        })

        const searchResult = await searchModel.generateContent(
          `Research the company "${companyName}" for a financial due diligence assessment. I need:
1. What industry they operate in
2. Any public risk factors (lawsuits, regulatory issues, financial distress)
3. General public information (size, reputation, market presence)
4. A brief risk summary for a lender considering financing their invoices

Respond in STRICT JSON format (no markdown, no code fences):
{
  "companyName": "${companyName}",
  "industry": "<industry>",
  "riskFactors": [<array of risk factor strings>],
  "publicInfo": "<2-3 sentences of public info>",
  "summary": "<1-2 sentence risk assessment>"
}`
        )

        const searchText = searchResult.response.text()
        const parsed = parseJsonResponse(searchText)
        if (parsed.companyName) {
          companyDueDiligence = parsed as typeof companyDueDiligence
        }
      } catch (err) {
        console.error('[AI Analyze] Company due diligence search failed:', err)
        companyDueDiligence.summary = `Could not complete due diligence search for "${companyName}".`
      }
    }

    // Combine results
    const result: AIAnalysisResult = {
      authenticity: analysis.authenticity || { score: 50, flags: [], summary: 'Unable to fully assess authenticity.' },
      crossReference: analysis.crossReference || { matched: false, discrepancies: [], summary: 'No documents to cross-reference.' },
      companyDueDiligence,
      fraudIndicators: (analysis.fraudIndicators as AIAnalysisResult['fraudIndicators']) || { riskLevel: 'medium' as const, flags: [], summary: 'Unable to fully assess fraud risk.' },
      overallSummary: (analysis.overallSummary as string) || 'Analysis partially completed.',
      recommendation: (analysis.recommendation as AIAnalysisResult['recommendation']) || 'caution',
    }

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[AI Analyze] Error:', err)
    return NextResponse.json(
      { error: 'AI analysis failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function buildInvoiceSummary(data: Record<string, unknown>): string {
  const lines: string[] = []
  const fields: [string, string][] = [
    ['Invoice ID / Number', String(data.qbInvoiceId ?? data.invoiceId ?? data.id ?? 'N/A')],
    ['Borrower Address', String(data.borrower ?? data.borrowerAddress ?? 'N/A')],
    ['Debtor / Customer', String(data.debtorName ?? data.customerName ?? 'N/A')],
    ['Face Value (USD)', data.faceValueUSD ? `$${Number(data.faceValueUSD).toLocaleString()}` : 'N/A'],
    ['Original Amount', data.faceValueOriginal ? `${Number(data.faceValueOriginal).toLocaleString()} ${data.originalCurrency ?? ''}` : 'N/A'],
    ['Currency', String(data.originalCurrency ?? data.currency ?? 'N/A')],
    ['Issue Date', String(data.issuedDate ?? data.txnDate ?? 'N/A')],
    ['Due Date', String(data.dueDate ?? 'N/A')],
    ['Risk Tier', String(data.riskTier ?? 'N/A')],
    ['Discount Rate (bps)', String(data.discountRateBps ?? 'N/A')],
  ]

  for (const [label, value] of fields) {
    lines.push(`- **${label}**: ${value}`)
  }

  if (data.lineItems && Array.isArray(data.lineItems)) {
    lines.push('\n### Line Items')
    for (const item of data.lineItems as Record<string, unknown>[]) {
      lines.push(`- ${item.description ?? 'Item'}: ${item.amount ?? 'N/A'} (qty: ${item.quantity ?? 'N/A'})`)
    }
  }

  return lines.join('\n')
}

function extractCompanyName(data: Record<string, unknown>): string | null {
  if (typeof data.debtorName === 'string') return data.debtorName
  if (typeof data.customerName === 'string') return data.customerName
  if (typeof data.companyName === 'string') return data.companyName
  // Try to extract from line items or nested data
  if (data.customer && typeof data.customer === 'object') {
    const customer = data.customer as Record<string, unknown>
    if (typeof customer.name === 'string') return customer.name
  }
  return null
}

function parseJsonResponse(text: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = text.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  cleaned = cleaned.trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('[AI Analyze] Failed to parse JSON response:', cleaned.slice(0, 200))
    return {}
  }
}
