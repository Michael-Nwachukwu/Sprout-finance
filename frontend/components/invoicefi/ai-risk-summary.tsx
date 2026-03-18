'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, CheckCircle, XCircle, Search, FileText, Loader2 } from 'lucide-react'
import type { AIAnalysisResult } from '@/lib/invoicefi/types'

interface AIRiskSummaryProps {
  invoiceData: Record<string, unknown>
  tokenId?: string
  supportingDocs?: { name: string; type: string; base64: string }[]
}

export function AIRiskSummary({ invoiceData, tokenId, supportingDocs }: AIRiskSummaryProps) {
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isCached, setIsCached] = useState(false)

  // Try to load cached analysis from minting phase
  useEffect(() => {
    if (!tokenId || analysis) return
    const loadCached = async () => {
      try {
        const res = await fetch(`/api/ai/cache?tokenId=${tokenId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.result) {
            setAnalysis(data.result)
            setIsCached(true)
          }
        }
      } catch {
        // No cached data — user can run fresh analysis
      }
    }
    loadCached()
  }, [tokenId, analysis])

  const runAnalysis = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceData, supportingDocs }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }
      const data = await res.json()
      setAnalysis(data.result)
      setIsCached(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsLoading(false)
    }
  }

  if (!analysis && !isLoading && !error) {
    return (
      <Card className="bg-card border-border p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-semibold text-foreground">AI Risk Analysis</h3>
          </div>
          <Button
            onClick={runAnalysis}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <Brain className="w-3.5 h-3.5 mr-1.5" />
            Run Analysis
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Powered by Gemini 2.5 Flash — analyzes invoice authenticity, cross-references documents, and performs company due diligence.
        </p>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border p-4 md:p-5">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Analysis Running...</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing invoice data, documents, and researching company background.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-card border-border p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Analysis Failed</h3>
              <p className="text-xs text-destructive mt-1">{error}</p>
            </div>
          </div>
          <Button onClick={runAnalysis} variant="outline" size="sm" className="text-xs">
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  if (!analysis) return null

  const recConfig = {
    proceed: { icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Proceed' },
    caution: { icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Caution' },
    reject: { icon: ShieldX, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Reject' },
  }
  const rec = recConfig[analysis.recommendation]
  const RecIcon = rec.icon

  return (
    <Card className="bg-card border-border p-4 md:p-5 space-y-4">
      {/* Header with recommendation badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <h3 className="text-sm font-semibold text-foreground">AI Risk Analysis</h3>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${rec.bg}`}>
          <RecIcon className={`w-4 h-4 ${rec.color}`} />
          <span className={`text-xs font-semibold ${rec.color}`}>{rec.label}</span>
        </div>
      </div>

      {/* Overall summary */}
      <p className="text-sm text-foreground leading-relaxed">{analysis.overallSummary}</p>

      {/* Score cards row */}
      <div className="grid grid-cols-3 gap-2">
        <ScoreCard
          label="Authenticity"
          score={analysis.authenticity.score}
          icon={<FileText className="w-3.5 h-3.5" />}
        />
        <ScoreCard
          label="Cross-Ref"
          matched={analysis.crossReference.matched}
          icon={<CheckCircle className="w-3.5 h-3.5" />}
        />
        <ScoreCard
          label="Fraud Risk"
          riskLevel={analysis.fraudIndicators.riskLevel}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        />
      </div>

      {/* Expand/collapse details */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-xs text-muted-foreground"
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </Button>

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* Authenticity */}
          <DetailSection
            title="Invoice Authenticity"
            icon={<FileText className="w-4 h-4 text-blue-600" />}
            summary={analysis.authenticity.summary}
            flags={analysis.authenticity.flags}
          />

          {/* Cross-Reference */}
          <DetailSection
            title="Document Cross-Reference"
            icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
            summary={analysis.crossReference.summary}
            flags={analysis.crossReference.discrepancies}
            flagLabel="Discrepancies"
          />

          {/* Fraud Indicators */}
          <DetailSection
            title="Fraud Indicators"
            icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            summary={analysis.fraudIndicators.summary}
            flags={analysis.fraudIndicators.flags}
          />

          {/* Company Due Diligence */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-purple-600" />
              <h4 className="text-xs font-semibold text-foreground">Company Due Diligence</h4>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Company</span>
                <span className="text-xs font-medium text-foreground">{analysis.companyDueDiligence.companyName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Industry</span>
                <span className="text-xs font-medium text-foreground">{analysis.companyDueDiligence.industry}</span>
              </div>
              {analysis.companyDueDiligence.publicInfo && (
                <p className="text-xs text-muted-foreground">{analysis.companyDueDiligence.publicInfo}</p>
              )}
              <p className="text-xs text-foreground">{analysis.companyDueDiligence.summary}</p>
              {analysis.companyDueDiligence.riskFactors.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-xs font-medium text-amber-700">Risk Factors:</span>
                  {analysis.companyDueDiligence.riskFactors.map((factor, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <XCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-muted-foreground">{factor}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rerun button */}
      <div className="flex justify-end">
        <Button onClick={runAnalysis} variant="ghost" size="sm" className="text-xs text-muted-foreground">
          <Brain className="w-3 h-3 mr-1" />
          Re-analyze
        </Button>
      </div>
    </Card>
  )
}

function ScoreCard({ label, score, matched, riskLevel, icon }: {
  label: string
  score?: number
  matched?: boolean
  riskLevel?: 'low' | 'medium' | 'high'
  icon: React.ReactNode
}) {
  let value: string
  let color: string

  if (score != null) {
    value = `${score}/100`
    color = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-600'
  } else if (matched != null) {
    value = matched ? 'Match' : 'Mismatch'
    color = matched ? 'text-green-600' : 'text-red-600'
  } else if (riskLevel) {
    value = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)
    color = riskLevel === 'low' ? 'text-green-600' : riskLevel === 'medium' ? 'text-amber-600' : 'text-red-600'
  } else {
    value = 'N/A'
    color = 'text-muted-foreground'
  }

  return (
    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  )
}

function DetailSection({ title, icon, summary, flags, flagLabel = 'Flags' }: {
  title: string
  icon: React.ReactNode
  summary: string
  flags: string[]
  flagLabel?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{summary}</p>
      {flags.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-amber-700">{flagLabel}:</span>
          {flags.map((flag, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">{flag}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
