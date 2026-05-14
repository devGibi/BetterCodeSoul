import { db } from '../services/Database.js'
import { formatCost } from '../utils/format.js'

export interface OptimizationStats {
  thinkTierRatio: number
  reviewTierUsage: number
  avgContextFill: number
  avgSessionCost: number
  graphifyActive: boolean
  contextModeActive: boolean
  projectFileCount: number
  providerCount: number
}

export interface OptimizationRule {
  id: string
  check: (stats: OptimizationStats) => boolean
  message: (stats: OptimizationStats) => string
}

export const optimizationRules: OptimizationRule[] = [
  {
    id: 'think_overuse',
    check: (stats) => stats.thinkTierRatio > 0.6,
    message: (stats) =>
      `PLAN tier kullanim orani %${Math.round(stats.thinkTierRatio * 100)}. Kod uretimi icin sonnet-4-5 veya kimi-k2 yeterli. Tahmini tasarruf: ~70% think-tier maliyeti.`,
  },
  {
    id: 'no_review_tier',
    check: (stats) => stats.reviewTierUsage === 0,
    message: () =>
      'REVIEW tier hic kullanilmamis. Dogrulama ve kucuk fixler icin haiku-4-5 veya gpt-4o-mini ekle. %70 maliyet azalmasi mumkun.',
  },
  {
    id: 'high_session_cost',
    check: (stats) => stats.avgSessionCost > 0.5,
    message: (stats) =>
      `Ortalama session maliyeti ${formatCost(stats.avgSessionCost)}. Gorevleri daha kucuk parcalara bol. Her session tek bir konuya odaklanmali.`,
  },
  {
    id: 'graphify_not_active',
    check: (stats) => !stats.graphifyActive && stats.projectFileCount > 30,
    message: () =>
      'Projede 30\'dan fazla dosya var ama Graphify aktif degil. Model her seferinde dosyalari okumak yerine grafigi sorgular. Kur: /bcs-graphify install',
  },
  {
    id: 'context_mode_not_active',
    check: (stats) => !stats.contextModeActive,
    message: () =>
      "Context Mode aktif degil. Tool output'lari context'e ham olarak giriyor. Aktiflestir: /bcs-context-mode enable. Beklenen tasarruf: ~98% tool output azalmasi",
  },
  {
    id: 'mixed_providers',
    check: (stats) => stats.providerCount > 2,
    message: () =>
      'Birden fazla provider kullaniliyor. Bu iyi. Tier-model eslemini optimize et: PLAN -> gemini-2.5-pro, KOD -> kimi-k2/deepseek-v3, REVIEW -> gpt-4o-mini/haiku-4-5',
  },
]

export function getOptimizationStats(): OptimizationStats {
  return db.getOptimizationStats()
}

export function getOptimizationSuggestions(): string[] {
  const stats = getOptimizationStats()
  const suggestions: string[] = []

  for (const rule of optimizationRules) {
    if (rule.check(stats)) {
      suggestions.push(rule.message(stats))
    }
  }

  return suggestions
}

export function formatOptimizationReport(): string {
  const suggestions = getOptimizationSuggestions()

  if (suggestions.length === 0) {
    return '## Optimizasyon\n\nOptimizasyon onerisi yok — kullanim verimli gorunuyor!'
  }

  let output = `## Optimizasyon Onerileri\n\n`
  for (let i = 0; i < suggestions.length; i++) {
    output += `${i + 1}. ${suggestions[i]}\n\n`
  }
  output += `Detayli token raporu: \`/bcs-tokens\``
  return output
}
