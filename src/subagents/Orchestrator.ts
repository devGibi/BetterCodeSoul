import fs from 'node:fs'
import path from 'node:path'
import { AgentRunner, type AgentConfig, type AgentResult, type AgentType } from './AgentRunner.js'
import { TaskDecomposer, type TaskPlan, type DecomposeContext } from './TaskDecomposer.js'
import { ResultMerger, type MergedResult } from './ResultMerger.js'
import { CostGuard } from './CostGuard.js'
import { modelRegistry } from '../services/ModelRegistry.js'
import { db } from '../services/Database.js'
import { authReader } from '../services/AuthReader.js'
import { logger } from '../utils/logger.js'

export interface OrchestrationResult extends MergedResult {
  cancelled?: boolean
  reason?: string
}

export interface OrchestrationOptions {
  strategy?: 'auto' | 'plan-code-review' | 'parallel-code' | 'sequential'
  maxCost?: number
}

export class Orchestrator {
  private agentRunner: AgentRunner
  private taskDecomposer: TaskDecomposer
  private resultMerger: ResultMerger
  private costGuard: CostGuard

  constructor(app?: unknown) {
    this.agentRunner = new AgentRunner(app)
    this.taskDecomposer = new TaskDecomposer()
    this.resultMerger = new ResultMerger()
    this.costGuard = new CostGuard()
  }

  async run(userRequest: string, projectPath: string, options: OrchestrationOptions = {}): Promise<OrchestrationResult> {
    const startTime = Date.now()

    try {
      await authReader.getProviders()
    } catch {
      logger.warn('Could not read auth providers for orchestration')
    }

    const contextFiles = await this.getContextFiles(projectPath)
    const availableModels = modelRegistry.getAllModels().map((m) => m.id)

    const decomposeCtx: DecomposeContext = {
      projectPath,
      contextFiles,
      availableModels,
    }

    const plan = await this.taskDecomposer.decompose(userRequest, decomposeCtx)

    if (options.maxCost) {
      const limits = this.costGuard.getLimits()
      if (plan.estimatedCost > options.maxCost) {
        const result: OrchestrationResult = {
          cancelled: true,
          reason: `Estimated cost ${plan.estimatedCost.toFixed(4)} exceeds max cost ${options.maxCost.toFixed(4)}`,
          output: '',
          totalTokens: 0,
          totalCost: 0,
          durationMs: Date.now() - startTime,
          modelsUsed: [],
          hasConflicts: false,
          issues: [],
          agentCount: 0,
        }
        return result
      }
    }

    const costCheck = await this.costGuard.check(plan.estimatedCost)
    if (!costCheck.approved) {
      const result: OrchestrationResult = {
        cancelled: true,
        reason: costCheck.reason,
        output: '',
        totalTokens: 0,
        totalCost: 0,
        durationMs: Date.now() - startTime,
        modelsUsed: [],
        hasConflicts: false,
        issues: [],
        agentCount: 0,
      }
      return result
    }

    const planResult = await this.agentRunner.run({
      agentType: 'planner',
      model: modelRegistry.getBestFor('think'),
      task: plan.plannerTask,
      context: contextFiles.length > 0 ? this.buildMinimalContext(projectPath, contextFiles) : undefined,
      maxTokens: 4000,
    })

    if (!planResult.success) {
      return {
        cancelled: true,
        reason: `Planning failed: ${planResult.error}`,
        output: '',
        totalTokens: 0,
        totalCost: 0,
        durationMs: Date.now() - startTime,
        modelsUsed: [],
        hasConflicts: false,
        issues: [],
        agentCount: 0,
      }
    }

    let coderResults: AgentResult[] = []

    if (plan.coderTasks.length > 0) {
      const coderPromises = plan.coderTasks.map(async (task) =>
        this.agentRunner.run({
          agentType: 'coder',
          model: modelRegistry.getBestFor('code'),
          task: task.task,
          context: [planResult.output, await this.readRelevantFiles(projectPath, task.files), this.readRulesFile(projectPath)]
            .filter(Boolean)
            .join('\n\n'),
          outputFiles: task.files,
          maxTokens: 3000,
        })
      )

      const settled = await Promise.allSettled(coderPromises)
      coderResults = settled
        .filter((r): r is PromiseFulfilledResult<AgentResult> => r.status === 'fulfilled' && r.value.success)
        .map((r) => r.value)
    }

    let reviewResults: AgentResult[] = []

    if (coderResults.length > 0) {
      const reviewPromises = coderResults.map((coderResult) =>
        this.agentRunner.run({
          agentType: 'reviewer',
          model: modelRegistry.getBestFor('review'),
          task: `Bu kodu incele: tip hatası, logic hatası, RULES.md ihlali var mı?\n\n${coderResult.output}`,
          context: coderResult.output,
          maxTokens: 1000,
        })
      )

      const settled = await Promise.allSettled(reviewPromises)
      reviewResults = settled
        .filter((r): r is PromiseFulfilledResult<AgentResult> => r.status === 'fulfilled' && r.value.success)
        .map((r) => r.value)
    }

    const merged = await this.resultMerger.merge({
      planResult,
      coderResults,
      reviewResults,
    })

    db.saveOrchestration({
      userRequest,
      agentCount: merged.agentCount,
      totalTokens: merged.totalTokens,
      totalCost: merged.totalCost,
      durationMs: merged.durationMs,
      modelsUsed: merged.modelsUsed,
      cancelled: false,
    })

    return { ...merged, durationMs: Date.now() - startTime }
  }

  private async getContextFiles(projectPath: string): Promise<string[]> {
    const candidates = ['RULES.md', 'SPEC.md', 'AGENTS.md', 'README.md', 'package.json']
    const found: string[] = []
    for (const file of candidates) {
      const fullPath = path.join(projectPath, file)
      if (fs.existsSync(fullPath)) {
        found.push(file)
      }
    }
    return found
  }

  private buildMinimalContext(projectPath: string, files: string[]): string {
    const contents: string[] = []
    for (const file of files) {
      try {
        const fullPath = path.join(projectPath, file)
        const content = fs.readFileSync(fullPath, 'utf-8')
        const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content
        contents.push(`### ${file}\n${truncated}`)
      } catch {
        // skip unreadable files
      }
    }
    return contents.join('\n\n')
  }

  private async readRelevantFiles(projectPath: string, files: string[]): Promise<string> {
    if (!files || files.length === 0) return ''
    return this.buildMinimalContext(projectPath, files)
  }

  private readRulesFile(projectPath: string): string {
    const rulesPath = path.join(projectPath, 'RULES.md')
    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, 'utf-8')
      return content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content
    }
    return ''
  }
}
