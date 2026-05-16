import type { Model, ModelTier } from './ModelRegistry.js'
import { db } from './Database.js'
import { repositoryIdentityService, type RepositoryIdentity } from './RepositoryIdentityService.js'
import { formatCost, formatDuration } from '../utils/format.js'

export interface RouterModelStats {
  model: string
  tier: string
  role: string
  runs: number
  qualityPassRate: number
  stepSuccessRate: number
  avgSuccessScore: number
  avgCost: number
  avgDurationMs: number
  avgTokens: number
  retryRate: number
}

export interface RouterCandidateInput {
  model: Model
  staticPriority: number
  staticReason: string
}

export interface RouterLearningContext {
  projectPath?: string
  repoKey?: string
  taskType?: string
  complexity?: string
  tier: ModelTier
  role?: string
  strategy?: 'learned' | 'cheap-first' | 'planner-strong' | 'escalation' | 'auto-reviewer'
  avoidModelIds?: string[]
  days?: number
}

export interface RouterScoredCandidate {
  modelId: string
  score: number
  staticPriority: number
  priceScore: number
  staticScore: number
  confidence: number
  runs: number
  qualityPassRate: number
  stepSuccessRate: number
  avgSuccessScore: number
  avgCost: number
  avgDurationMs: number
  retryRate: number
  eligible: boolean
  reason: string
}

export interface RouterLearningResult {
  selected: RouterScoredCandidate
  candidates: RouterScoredCandidate[]
  strategy: string
  repoKey?: string
  reason: string
}

export class RouterLearningService {
  rankCandidates(candidates: RouterCandidateInput[], context: RouterLearningContext): RouterLearningResult {
    if (candidates.length === 0) {
      throw new Error('Router requires at least one candidate')
    }

    const repoKey = context.repoKey || (context.projectPath ? repositoryIdentityService.getRepoKey(context.projectPath) : undefined)
    const stats = this.loadStats({ ...context, repoKey })
    const maxPriority = Math.max(...candidates.map((candidate) => candidate.staticPriority), 1)
    const minListPrice = Math.min(...candidates.map((candidate) => modelListPrice(candidate.model)))
    const statsWithDuration = [...stats.values()].filter((row) => row.avgDurationMs > 0)
    const bestDuration = statsWithDuration.length > 0 ? Math.min(...statsWithDuration.map((row) => row.avgDurationMs)) : 0
    const bestObservedCost = Math.min(...[...stats.values()].filter((row) => row.avgCost > 0).map((row) => row.avgCost), Number.POSITIVE_INFINITY)
    const avoid = new Set(context.avoidModelIds || [])
    const canAvoid = avoid.size > 0 && candidates.some((candidate) => !avoid.has(candidate.model.id))
    const strategy = context.strategy || defaultStrategy(context.tier)

    const scored = candidates.map((candidate) => {
      const stat = stats.get(candidate.model.id)
      const runs = stat?.runs || 0
      const confidence = Math.min(1, runs / 5)
      const staticScore = maxPriority <= 1 ? 1 : Math.max(0.1, 1 - ((candidate.staticPriority - 1) / maxPriority))
      const priceScore = Math.min(1, minListPrice / modelListPrice(candidate.model))
      const observedCostScore = stat?.avgCost && Number.isFinite(bestObservedCost)
        ? Math.min(1, bestObservedCost / stat.avgCost)
        : priceScore
      const durationScore = stat?.avgDurationMs && bestDuration > 0 ? Math.min(1, bestDuration / stat.avgDurationMs) : 1
      const retryScore = Math.max(0, 1 - (stat?.retryRate || 0))
      const qualityScore = (stat?.avgSuccessScore || 80) / 100
      const qualityPassRate = stat?.qualityPassRate ?? 0
      const stepSuccessRate = stat?.stepSuccessRate ?? 0
      const weights = scoreWeights(context.tier, strategy)
      const historyScore =
        weights.quality * qualityScore +
        weights.pass * (runs > 0 ? qualityPassRate : 0.8) +
        weights.step * (runs > 0 ? stepSuccessRate : 0.8) +
        weights.cost * observedCostScore +
        weights.retry * retryScore +
        weights.duration * durationScore
      const baseScore = weights.static * staticScore + weights.baseCost * priceScore + weights.baseNeutral * 0.8
      let score = confidence > 0 ? (confidence * historyScore) + ((1 - confidence) * baseScore) : baseScore
      const eligible = !(canAvoid && avoid.has(candidate.model.id))
      if (!eligible) score *= 0.05

      return {
        modelId: candidate.model.id,
        score: round(score),
        staticPriority: candidate.staticPriority,
        priceScore: round(priceScore),
        staticScore: round(staticScore),
        confidence: round(confidence),
        runs,
        qualityPassRate: round(qualityPassRate),
        stepSuccessRate: round(stepSuccessRate),
        avgSuccessScore: round(stat?.avgSuccessScore || 0),
        avgCost: stat?.avgCost || 0,
        avgDurationMs: stat?.avgDurationMs || 0,
        retryRate: round(stat?.retryRate || 0),
        eligible,
        reason: this.reason(candidate, stat, strategy, eligible),
      }
    }).sort((a, b) => b.score - a.score || a.staticPriority - b.staticPriority)

    const selected = scored[0]
    return {
      selected,
      candidates: scored,
      strategy,
      repoKey,
      reason: `${strategy}: ${selected.reason}; score ${selected.score.toFixed(2)}`,
    }
  }

  getReport(projectPath: string, days = 30): {
    repo: RepositoryIdentity
    days: number
    summary: ReturnType<typeof db.getRouterSummary>
    recommendations: ReturnType<typeof db.getRouterRecommendations>
    scope: 'repo' | 'global'
  } {
    const repo = repositoryIdentityService.identify(projectPath)
    let recommendations = db.getRouterRecommendations(days, repo.key, 12)
    let summary = db.getRouterSummary(days, repo.key)
    let scope: 'repo' | 'global' = 'repo'

    if (recommendations.length === 0 && summary.outcomes === 0) {
      recommendations = db.getRouterRecommendations(days, undefined, 12)
      summary = db.getRouterSummary(days)
      scope = 'global'
    }

    return { repo, days, summary, recommendations, scope }
  }

  formatReport(projectPath: string, days = 30): string {
    const report = this.getReport(projectPath, days)
    const lines = [
      `## Auto-Improving Router — ${report.days} Days`,
      '',
      `Repo: \`${report.repo.label}\` (${report.scope === 'repo' ? 'repo-specific' : 'global fallback'})`,
      '',
      '| Metric | Value |',
      '|---|---:|',
      `| Routing decisions | ${report.summary.decisions} |`,
      `| Model outcomes | ${report.summary.outcomes} |`,
      `| Avg quality score | ${report.summary.avgSuccessScore.toFixed(1)}/100 |`,
      `| Quality pass rate | ${(report.summary.qualityPassRate * 100).toFixed(0)}% |`,
      `| Escalations | ${report.summary.escalationCount} |`,
      `| Auto reviewers | ${report.summary.autoReviewerCount} |`,
      '',
      '### Learned Ranking',
    ]

    if (report.recommendations.length === 0) {
      lines.push('_No router learning history yet. Run `/bcs-agent` to create outcomes._')
    } else {
      lines.push('| Model | Tier | Runs | Quality | Step | Avg Score | Avg Cost | Avg Time | Retry |')
      lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|')
      for (const row of report.recommendations) {
        lines.push(`| ${row.model} | ${row.tier} | ${row.runs} | ${(row.qualityPassRate * 100).toFixed(0)}% | ${(row.stepSuccessRate * 100).toFixed(0)}% | ${row.avgSuccessScore.toFixed(1)} | ${formatCost(row.avgCost)} | ${formatDuration(row.avgDurationMs)} | ${(row.retryRate * 100).toFixed(0)}% |`)
      }
    }

    lines.push('', 'Strategy: planner uses strong THINK models; code starts cheap and escalates on low quality; low-quality simple tasks get an automatic reviewer.')
    return lines.join('\n')
  }

  private loadStats(context: RouterLearningContext): Map<string, RouterModelStats> {
    const days = context.days || 90
    const maps = [
      db.getRouterModelStats({ days, tier: context.tier }),
      context.taskType ? db.getRouterModelStats({ days, tier: context.tier, taskType: context.taskType }) : [],
      context.repoKey ? db.getRouterModelStats({ days, tier: context.tier, repoKey: context.repoKey }) : [],
      context.repoKey && context.taskType ? db.getRouterModelStats({ days, tier: context.tier, repoKey: context.repoKey, taskType: context.taskType }) : [],
      context.repoKey && context.taskType && context.complexity ? db.getRouterModelStats({ days, tier: context.tier, repoKey: context.repoKey, taskType: context.taskType, complexity: context.complexity }) : [],
    ]

    const merged = new Map<string, RouterModelStats>()
    for (const rows of maps) {
      for (const row of rows) {
        merged.set(row.model, row)
      }
    }
    return merged
  }

  private reason(candidate: RouterCandidateInput, stat: RouterModelStats | undefined, strategy: string, eligible: boolean): string {
    const prefix = eligible ? candidate.staticReason : 'escalation skipped previous failed model'
    if (!stat || stat.runs === 0) return `${prefix}; no history yet, using ${strategy} prior`
    return `${prefix}; ${stat.runs} runs, ${(stat.qualityPassRate * 100).toFixed(0)}% quality pass, avg ${stat.avgSuccessScore.toFixed(1)}/100`
  }
}

function defaultStrategy(tier: ModelTier): NonNullable<RouterLearningContext['strategy']> {
  if (tier === 'think') return 'planner-strong'
  if (tier === 'code') return 'cheap-first'
  return 'learned'
}

function scoreWeights(tier: ModelTier, strategy: string): {
  quality: number
  pass: number
  step: number
  cost: number
  retry: number
  duration: number
  static: number
  baseCost: number
  baseNeutral: number
} {
  if (strategy === 'escalation') {
    return { quality: 0.35, pass: 0.25, step: 0.15, cost: 0.1, retry: 0.1, duration: 0.05, static: 0.25, baseCost: 0.25, baseNeutral: 0.5 }
  }
  if (tier === 'think') {
    return { quality: 0.35, pass: 0.2, step: 0.15, cost: 0.1, retry: 0.1, duration: 0.1, static: 0.5, baseCost: 0.15, baseNeutral: 0.35 }
  }
  if (tier === 'code') {
    return { quality: 0.3, pass: 0.18, step: 0.12, cost: 0.25, retry: 0.1, duration: 0.05, static: 0.2, baseCost: 0.55, baseNeutral: 0.25 }
  }
  return { quality: 0.35, pass: 0.2, step: 0.15, cost: 0.15, retry: 0.1, duration: 0.05, static: 0.25, baseCost: 0.45, baseNeutral: 0.3 }
}

function modelListPrice(model: Model): number {
  return Math.max(model.inputPrice + model.outputPrice, 0.0001)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export const routerLearningService = new RouterLearningService()
