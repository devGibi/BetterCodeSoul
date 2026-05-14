import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskDecomposer } from '../src/subagents/TaskDecomposer'

vi.mock('../src/services/Database.js', () => ({
  db: {
    saveDecomposeDecision: vi.fn(),
    getSetting: vi.fn().mockReturnValue(null),
  },
}))

vi.mock('../src/services/GraphifyService.js', () => ({
  graphifyService: {
    isActive: vi.fn().mockReturnValue(false),
  },
}))

vi.mock('../src/services/ModelRegistry.js', () => ({
  modelRegistry: {
    getConnectedModels: vi.fn().mockReturnValue([]),
    getConnectedModelIds: vi.fn().mockReturnValue([]),
    getModelsByTier: vi.fn().mockReturnValue([]),
    getAllModels: vi.fn().mockReturnValue([]),
    getById: vi.fn().mockReturnValue(undefined),
  },
}))

describe('TaskDecomposer', () => {
  const decomposer = new TaskDecomposer()

  describe('detectTaskType', () => {
    it('detects feature tasks', () => {
      expect(decomposer.detectTaskType('kullanıcı profil sayfası ekle')).toBe('feature')
      expect(decomposer.detectTaskType('create a new component')).toBe('feature')
      expect(decomposer.detectTaskType('build auth system')).toBe('feature')
    })

    it('detects fix tasks', () => {
      expect(decomposer.detectTaskType('login hatasını düzelt')).toBe('fix')
      expect(decomposer.detectTaskType('fix the broken test')).toBe('fix')
      expect(decomposer.detectTaskType('bug in auth flow')).toBe('fix')
    })

    it('detects refactor tasks', () => {
      expect(decomposer.detectTaskType('kodu refactor et')).toBe('refactor')
      expect(decomposer.detectTaskType('clean up the codebase')).toBe('refactor')
    })

    it('detects review tasks', () => {
      expect(decomposer.detectTaskType('kodu incele')).toBe('review')
      expect(decomposer.detectTaskType('review the PR')).toBe('review')
    })

    it('detects research tasks', () => {
      expect(decomposer.detectTaskType('bu kütüphane nedir?')).toBe('research')
      expect(decomposer.detectTaskType('explain how auth works')).toBe('research')
    })

    it('defaults to unknown when no pattern matches', () => {
      expect(decomposer.detectTaskType('do something random')).toBe('unknown')
    })
  })

  describe('decompose', () => {
    it('creates a DecomposeDecision for feature tasks', async () => {
      const decision = await decomposer.decompose('kullanıcı profil sayfası ekle', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['gemini-2.5-pro', 'kimi-k2', 'claude-haiku-4-5'],
      })

      expect(decision.taskType).toBe('feature')
      expect(decision.complexity).toBeDefined()
      expect(decision.reasoning.length).toBeGreaterThan(0)
      expect(decision.coderModels.length).toBeGreaterThanOrEqual(1)
      expect(decision.estimatedCost).toBeGreaterThanOrEqual(0)
      expect(decision.estimatedMinutes).toBeGreaterThan(0)
    })

    it('creates a simple plan for fix tasks', async () => {
      const decision = await decomposer.decompose('fix the broken test', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['gemini-2.5-pro', 'kimi-k2'],
      })

      expect(decision.taskType).toBe('fix')
      expect(decision.coderModels.length).toBeGreaterThanOrEqual(1)
    })

    it('creates a plan with coders for review tasks', async () => {
      const decision = await decomposer.decompose('kodu incele', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['gemini-2.5-pro'],
      })

      expect(decision.taskType).toBe('review')
      expect(decision.coderModels.length).toBeGreaterThanOrEqual(0)
    })

    it('includes warnings when no connected models', async () => {
      const decision = await decomposer.decompose('test task', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: [],
      })

      expect(decision.warnings.length).toBeGreaterThan(0)
    })

    it('generates reasoning for each decision', async () => {
      const decision = await decomposer.decompose('create a new feature', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['kimi-k2'],
      })

      expect(decision.reasoning.length).toBeGreaterThanOrEqual(2)
      expect(decision.reasoning.some(r => r.includes('Gorev tipi'))).toBe(true)
      expect(decision.reasoning.some(r => r.includes('Karmasiklik'))).toBe(true)
    })
  })

  describe('formatDecision', () => {
    it('formats decision as markdown', async () => {
      const decision = await decomposer.decompose('create a new feature', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['kimi-k2'],
      })

      const formatted = decomposer.formatDecision(decision)
      expect(formatted).toContain('Gorev Analizi')
      expect(formatted).toContain('Model plani')
      expect(formatted).toContain('Tahmini')
    })
  })

  describe('toPlan', () => {
    it('converts decision to TaskPlan', async () => {
      const decision = await decomposer.decompose('create a new feature', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['kimi-k2'],
      })

      const plan = decomposer.toPlan(decision, 'create a new feature')
      expect(plan.strategy).toBeDefined()
      expect(plan.estimatedCost).toBe(decision.estimatedCost)
      expect(plan.estimatedMinutes).toBe(decision.estimatedMinutes)
    })
  })
})
