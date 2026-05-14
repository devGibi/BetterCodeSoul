import { describe, it, expect } from 'vitest'
import { TaskDecomposer } from '../src/subagents/TaskDecomposer'

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

    it('defaults to feature', () => {
      expect(decomposer.detectTaskType('do something random')).toBe('feature')
    })
  })

  describe('decompose', () => {
    it('creates a plan for feature tasks', async () => {
      const plan = await decomposer.decompose('kullanıcı profil sayfası ekle', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['gemini-2.5-pro', 'kimi-k2', 'claude-haiku-4-5'],
      })

      expect(plan.strategy).toBe('plan-code-review')
      expect(plan.plannerTask).toContain('mimari plan')
      expect(plan.coderTasks.length).toBeGreaterThanOrEqual(1)
      expect(plan.reviewTask).toBeTruthy()
      expect(plan.estimatedCost).toBeGreaterThan(0)
      expect(plan.estimatedMinutes).toBeGreaterThan(0)
    })

    it('creates a sequential plan for fix tasks', async () => {
      const plan = await decomposer.decompose('login hatasını düzelt', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['gemini-2.5-pro', 'kimi-k2'],
      })

      expect(plan.strategy).toBe('sequential')
      expect(plan.coderTasks.length).toBe(1)
    })

    it('creates a plan with no coders for review tasks', async () => {
      const plan = await decomposer.decompose('kodu incele', {
        projectPath: '/tmp/test',
        contextFiles: [],
        availableModels: ['gemini-2.5-pro'],
      })

      expect(plan.strategy).toBe('sequential')
      expect(plan.coderTasks.length).toBe(0)
    })
  })
})
