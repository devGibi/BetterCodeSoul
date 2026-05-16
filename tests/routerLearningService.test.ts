import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterLearningService } from '../src/services/RouterLearningService'
import type { Model } from '../src/services/ModelRegistry'

const dbMock = vi.hoisted(() => ({
  getRouterModelStats: vi.fn(),
  getRouterSummary: vi.fn(),
  getRouterRecommendations: vi.fn(),
}))

vi.mock('../src/services/Database.js', () => ({ db: dbMock }))

describe('RouterLearningService', () => {
  const models: Record<string, Model> = {
    kimi: { id: 'kimi-k2', name: 'Kimi', provider: 'moonshot', tier: 'code', contextWindow: 128000, inputPrice: 0.6, outputPrice: 2.5, authMethod: [] },
    deepseek: { id: 'deepseek-v3', name: 'DeepSeek', provider: 'deepseek', tier: 'code', contextWindow: 64000, inputPrice: 0.27, outputPrice: 1.1, authMethod: [] },
    sonnet: { id: 'claude-sonnet-4-5', name: 'Sonnet', provider: 'anthropic', tier: 'code', contextWindow: 200000, inputPrice: 3, outputPrice: 15, authMethod: [] },
  }

  beforeEach(() => {
    dbMock.getRouterModelStats.mockReset()
    dbMock.getRouterSummary.mockReset()
    dbMock.getRouterRecommendations.mockReset()
    dbMock.getRouterModelStats.mockReturnValue([])
  })

  it('starts with the cheapest viable code model when there is no history', () => {
    const result = new RouterLearningService().rankCandidates([
      { model: models.kimi, staticPriority: 1, staticReason: 'static code default' },
      { model: models.deepseek, staticPriority: 2, staticReason: 'cheapest code model' },
    ], { tier: 'code', taskType: 'feature', strategy: 'cheap-first', repoKey: 'repo:test' })

    expect(result.selected.modelId).toBe('deepseek-v3')
    expect(result.strategy).toBe('cheap-first')
  })

  it('promotes the model with better repo/task quality history', () => {
    dbMock.getRouterModelStats.mockReturnValue([
      { model: 'kimi-k2', tier: 'code', role: 'coder', runs: 6, qualityPassRate: 1, stepSuccessRate: 1, avgSuccessScore: 95, avgCost: 0.006, avgDurationMs: 1000, avgTokens: 1000, retryRate: 0 },
      { model: 'deepseek-v3', tier: 'code', role: 'coder', runs: 6, qualityPassRate: 0.3, stepSuccessRate: 0.5, avgSuccessScore: 62, avgCost: 0.002, avgDurationMs: 900, avgTokens: 1000, retryRate: 0.5 },
    ])

    const result = new RouterLearningService().rankCandidates([
      { model: models.kimi, staticPriority: 1, staticReason: 'static code default' },
      { model: models.deepseek, staticPriority: 2, staticReason: 'cheapest code model' },
    ], { tier: 'code', taskType: 'fix', complexity: 'medium', strategy: 'cheap-first', repoKey: 'repo:test' })

    expect(result.selected.modelId).toBe('kimi-k2')
    expect(result.selected.confidence).toBe(1)
  })

  it('avoids failed cheap models during escalation when another candidate exists', () => {
    const result = new RouterLearningService().rankCandidates([
      { model: models.deepseek, staticPriority: 1, staticReason: 'cheapest code model' },
      { model: models.sonnet, staticPriority: 2, staticReason: 'strong fallback' },
    ], { tier: 'code', strategy: 'escalation', avoidModelIds: ['deepseek-v3'], repoKey: 'repo:test' })

    expect(result.selected.modelId).toBe('claude-sonnet-4-5')
    expect(result.candidates.find((candidate) => candidate.modelId === 'deepseek-v3')?.eligible).toBe(false)
  })
})
