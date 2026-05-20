import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { QualityLoopService } from '../src/services/QualityLoopService'
import { diffSummaryService } from '../src/services/DiffSummaryService'
import type { AgentResult } from '../src/subagents/AgentRunner'
import type { MergedResult } from '../src/subagents/ResultMerger'

describe('QualityLoopService', () => {
  const created: string[] = []

  afterEach(() => {
    for (const dir of created.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-quality-'))
    created.push(dir)
    return dir
  }

  const agent = (overrides: Partial<AgentResult> = {}): AgentResult => ({
    agentId: 'coder_A',
    output: 'diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+new',
    inputTokens: 100,
    outputTokens: 50,
    model: 'kimi-k2',
    durationMs: 1000,
    success: true,
    ...overrides,
  })

  function merged(results: AgentResult[], overrides: Partial<MergedResult> = {}): MergedResult {
    return {
      output: 'merged',
      totalTokens: 150,
      totalCost: 0.001,
      durationMs: 1000,
      modelsUsed: ['kimi-k2'],
      hasConflicts: false,
      issues: [],
      agentCount: results.length,
      diffSummary: diffSummaryService.summarizeAgentDiffs(results),
      ...overrides,
    }
  }

  it('passes a clean run without detected commands', async () => {
    const dir = tempDir()
    const results = [agent()]

    const quality = await new QualityLoopService().run({
      projectPath: dir,
      merged: merged(results),
      allResults: results,
      totalCost: 0.001,
    })

    expect(quality.score).toBe(100)
    expect(quality.passed).toBe(true)
    expect(quality.costPerSuccessfulTask).toBe(0.001)
    expect(quality.shouldRetry).toBe(false)
  })

  it('recommends one retry for failed agent work', async () => {
    const dir = tempDir()
    const results = [agent({ success: false, error: 'tool failed' })]

    const quality = await new QualityLoopService().run({
      projectPath: dir,
      merged: merged(results, { issues: ['review issue'] }),
      allResults: results,
      totalCost: 0.001,
    })

    expect(quality.passed).toBe(false)
    expect(quality.shouldRetry).toBe(true)
    expect(quality.failedTasks).toBe(1)
  })

  it('uses project quality commands from .bcs.json first', async () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, '.bcs.json'), JSON.stringify({
      version: 1,
      defaultTool: 'opencode',
      mode: 'balanced',
      risk: 'medium',
      budget: { perTask: 0.25, daily: 5 },
      quality: { test: 'node -e "process.exit(0)"' },
      routing: { simple: 'cheap-first', medium: 'cheap-first-with-review', complex: 'planner-coder-reviewer' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }), 'utf-8')
    const results = [agent()]

    const quality = await new QualityLoopService().run({
      projectPath: dir,
      merged: merged(results),
      allResults: results,
      totalCost: 0.001,
    })

    expect(quality.commands).toHaveLength(1)
    expect(quality.commands[0].display).toBe('node -e "process.exit(0)"')
    expect(quality.commands[0].success).toBe(true)
  })
})
