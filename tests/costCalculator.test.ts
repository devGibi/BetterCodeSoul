import { describe, it, expect, vi } from 'vitest'
import { CostCalculator } from '../src/services/CostCalculator'

describe('CostCalculator', () => {
  const calc = new CostCalculator()

  const mockModel = {
    id: 'test-model',
    name: 'Test Model',
    provider: 'test',
    tier: 'code' as const,
    contextWindow: 128000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    authMethod: ['apikey'],
  }

  it('calculates cost correctly', () => {
    const cost = calc.calculate({ input: 1000, output: 500 }, mockModel)
    // input: 1000/1M * 3.0 = 0.003, output: 500/1M * 15.0 = 0.0075
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it('calculates zero cost for zero tokens', () => {
    const cost = calc.calculate({ input: 0, output: 0 }, mockModel)
    expect(cost).toBe(0)
  })

  it('calculates orchestration cost', () => {
    const plannerModel = { ...mockModel, inputPrice: 1.25, outputPrice: 10.0 }
    const coderModel = { ...mockModel, inputPrice: 0.60, outputPrice: 2.5 }
    const reviewerModel = { ...mockModel, inputPrice: 0.80, outputPrice: 4.0 }

    const cost = calc.estimateOrchestration({
      plannerTokens: { input: 3000, output: 2000 },
      coderCount: 3,
      coderTokens: { input: 4000, output: 2000 },
      reviewerCount: 3,
      reviewerTokens: { input: 2000, output: 800 },
      plannerModel,
      coderModel,
      reviewerModel,
    })

    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(1) // should be very cheap
  })
})
