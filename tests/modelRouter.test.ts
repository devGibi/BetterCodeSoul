import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelRouter } from '../src/services/ModelRouter'
import type { Model } from '../src/services/ModelRegistry'

const dbMock = vi.hoisted(() => ({
  getRouterModelStats: vi.fn(),
  saveRoutingLog: vi.fn(),
  saveRouterDecision: vi.fn(),
}))

vi.mock('../src/services/Database.js', () => ({ db: dbMock }))

describe('ModelRouter', () => {
  const models: Model[] = [
    { id: 'kimi-k2', name: 'Kimi', provider: 'moonshot', tier: 'code', contextWindow: 128000, inputPrice: 0.6, outputPrice: 2.5, authMethod: [] },
    { id: 'deepseek-v3', name: 'DeepSeek', provider: 'deepseek', tier: 'code', contextWindow: 64000, inputPrice: 0.27, outputPrice: 1.1, authMethod: [] },
    { id: 'claude-sonnet-4-5', name: 'Sonnet', provider: 'anthropic', tier: 'code', contextWindow: 200000, inputPrice: 3, outputPrice: 15, authMethod: [] },
    { id: 'gemini-2.5-pro', name: 'Gemini Pro', provider: 'google', tier: 'think', contextWindow: 1000000, inputPrice: 1.25, outputPrice: 10, authMethod: [] },
  ]

  const router = new ModelRouter({
    getById: (id) => models.find((model) => model.id === id),
    getAllModels: () => models,
  })

  beforeEach(() => {
    dbMock.getRouterModelStats.mockReset()
    dbMock.saveRoutingLog.mockReset()
    dbMock.saveRouterDecision.mockReset()
    dbMock.getRouterModelStats.mockReturnValue([])
  })

  it('only selects from connected candidates when available', () => {
    const result = router.route('code', ['kimi-k2'], { repoKey: 'repo:test', taskType: 'feature' })

    expect(result.model.id).toBe('kimi-k2')
    expect(result.warning).toBeUndefined()
  })

  it('uses cheap-first learned routing for code when several models are connected', () => {
    const result = router.route('code', ['kimi-k2', 'deepseek-v3'], { repoKey: 'repo:test', taskType: 'feature' })

    expect(result.model.id).toBe('deepseek-v3')
    expect(result.strategy).toBe('cheap-first')
  })

  it('logs learned router decisions with candidate scores', () => {
    const result = router.routeAndLog('code', ['kimi-k2', 'deepseek-v3'], undefined, {
      repoKey: 'repo:test',
      taskType: 'fix',
      complexity: 'simple',
      role: 'coder',
      orchestrationId: 123,
    })

    expect(result.model.id).toBe('deepseek-v3')
    expect(dbMock.saveRoutingLog).toHaveBeenCalledWith(expect.objectContaining({ selectedModel: 'deepseek-v3' }))
    expect(dbMock.saveRouterDecision).toHaveBeenCalledWith(expect.objectContaining({
      orchestrationId: 123,
      selectedModel: 'deepseek-v3',
      taskType: 'fix',
      role: 'coder',
    }))
  })
})
