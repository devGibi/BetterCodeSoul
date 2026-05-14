import { db } from './Database.js'
import { costCalculator, type TokenUsage } from './CostCalculator.js'
import { modelRegistry } from './ModelRegistry.js'
import { logger } from '../utils/logger.js'

interface ToolStartInfo {
  tool: string
  input: unknown
  startTime: number
}

export class TokenTracker {
  private activeTools = new Map<string, ToolStartInfo>()
  private sessionId: string

  constructor() {
    this.sessionId = `session_${Date.now()}`
  }

  init(): void {
    logger.info('TokenTracker initialized', { sessionId: this.sessionId })
  }

  recordToolStart(tool: string, input: unknown): void {
    const key = `${tool}_${Date.now()}`
    this.activeTools.set(key, { tool, input, startTime: Date.now() })
    logger.debug(`Tool started: ${tool}`, { key })
  }

  recordToolEnd(tool: string, tokens: TokenUsage, output: unknown): void {
    const model = modelRegistry.getBestFor('code')
    const cost = costCalculator.calculate(tokens, model)

    db.saveToolCall({
      sessionId: this.sessionId,
      tool,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cost,
      model: model.id,
      timestamp: Date.now(),
      durationMs: 0,
    })

    logger.debug(`Tool ended: ${tool}`, { tokens, cost })
  }

  getSessionId(): string {
    return this.sessionId
  }

  getSessionStats(): {
    totalInput: number
    totalOutput: number
    totalCost: number
    toolCount: number
  } {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return db.getTokenStatsByPeriod(startOfDay.getTime())
  }

  getTodayCost(): number {
    return db.getTodayCost()
  }
}

export function parseTokensFromOutput(output: unknown): TokenUsage {
  const text = typeof output === 'string' ? output : JSON.stringify(output || '')

  const tokenMatch = text.match(/tokens?:\s*(\d+)/i)
  const inputMatch = text.match(/input.*?(\d+).*?token/i)
  const outputMatch = text.match(/output.*?(\d+).*?token/i)
  const costMatch = text.match(/cost:\s*\$?([\d.]+)/i)
  const modelMatch = text.match(/model:\s*([a-z0-9._-]+)/i)

  let inputTokens = 0
  let outputTokens = 0

  if (inputMatch) {
    inputTokens = parseInt(inputMatch[1], 10)
  } else if (tokenMatch) {
    inputTokens = parseInt(tokenMatch[1], 10)
  }

  if (outputMatch) {
    outputTokens = parseInt(outputMatch[1], 10)
  } else if (tokenMatch && !inputMatch) {
    outputTokens = parseInt(tokenMatch[1], 10)
  }

  if (inputTokens === 0 && outputTokens === 0) {
    const estimated = estimateTokens(text)
    inputTokens = estimated.input
    outputTokens = estimated.output
  }

  return { input: inputTokens, output: outputTokens, model: modelMatch?.[1] }
}

function estimateTokens(text: string): { input: number; output: number } {
  const charCount = text.length
  const estimatedTokens = Math.ceil(charCount / 4)

  return {
    input: Math.ceil(estimatedTokens * 0.3),
    output: Math.ceil(estimatedTokens * 0.7),
  }
}

export const tokenTracker = new TokenTracker()
