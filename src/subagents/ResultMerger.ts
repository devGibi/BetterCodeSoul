import type { AgentResult } from './AgentRunner.js'
import { costCalculator } from '../services/CostCalculator.js'
import { modelRegistry } from '../services/ModelRegistry.js'

export interface MergeInput {
  planResult: AgentResult
  coderResults: AgentResult[]
  reviewResults: AgentResult[]
}

export interface MergedResult {
  output: string
  totalTokens: number
  totalCost: number
  durationMs: number
  modelsUsed: string[]
  hasConflicts: boolean
  issues: string[]
  agentCount: number
}

export interface FileConflict {
  file: string
  agents: string[]
}

export class ResultMerger {
  async merge(results: MergeInput): Promise<MergedResult> {
    const output: string[] = []

    output.push('## Mimari Plan\n' + results.planResult.output)
    output.push('---')

    results.coderResults.forEach((r, i) => {
      output.push(`## Implementasyon ${String.fromCharCode(65 + i)}\n${r.output}`)
    })
    output.push('---')

    const issues = results.reviewResults
      .map((r) => r.output)
      .filter((out) => !out.includes('ONAYLANDI'))

    if (issues.length > 0) {
      output.push('## Review Bulgulari\n' + issues.join('\n\n'))
    } else {
      output.push('## Tum Parcalar Onaylandi')
    }

    const fileConflicts = this.detectFileConflicts(results.coderResults)
    if (fileConflicts.length > 0) {
      output.push(
        '## Dosya Cakismalari\n' +
          fileConflicts.map((f) => `${f.file}: ${f.agents.join(', ')} ayni dosyaya yazdi -> manuel birlestir`).join('\n')
      )
    }

    const allResults = [results.planResult, ...results.coderResults, ...results.reviewResults]
    const totalTokens = allResults.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)
    const totalCost = this.calculateTotalCost(results)
    const maxCoderDuration = results.coderResults.length > 0
      ? Math.max(...results.coderResults.map((r) => r.durationMs))
      : 0
    const durationMs = maxCoderDuration + results.planResult.durationMs
    const modelsUsed = [...new Set([results.planResult.model, ...results.coderResults.map((r) => r.model)])]

    return {
      output: output.join('\n\n'),
      totalTokens,
      totalCost,
      durationMs,
      modelsUsed,
      hasConflicts: fileConflicts.length > 0,
      issues,
      agentCount: allResults.length,
    }
  }

  private detectFileConflicts(coderResults: AgentResult[]): FileConflict[] {
    const fileMap = new Map<string, string[]>()

    for (const result of coderResults) {
      const fileMatches = result.output.match(/\/\/\s*(src\/[^\s`]+|migrations\/[^\s`]+)/g) || []
      for (const match of fileMatches) {
        const file = match.replace('//', '').trim()
        if (!fileMap.has(file)) fileMap.set(file, [])
        fileMap.get(file)!.push(result.agentId)
      }
    }

    return [...fileMap.entries()]
      .filter(([, agents]) => agents.length > 1)
      .map(([file, agents]) => ({ file, agents }))
  }

  private calculateTotalCost(results: MergeInput): number {
    const allResults = [results.planResult, ...results.coderResults, ...results.reviewResults]
    let total = 0

    for (const r of allResults) {
      const model = modelRegistry.getModel(r.model) || modelRegistry.getBestFor('code')
      total += costCalculator.calculate({ input: r.inputTokens, output: r.outputTokens }, model)
    }

    return total
  }
}

export const resultMerger = new ResultMerger()
