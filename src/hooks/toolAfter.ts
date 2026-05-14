import { tokenTracker, parseTokensFromOutput } from '../services/TokenTracker.js'
import { costCalculator } from '../services/CostCalculator.js'
import { modelRegistry } from '../services/ModelRegistry.js'
import { db } from '../services/Database.js'
import { logger } from '../utils/logger.js'

export async function onToolAfter(
  input: { tool: string; input: unknown },
  output: unknown
): Promise<void> {
  try {
    const tokens = parseTokensFromOutput(output)
    tokenTracker.recordToolEnd(input.tool, tokens, output)

    const model = modelRegistry.getBestFor('code')
    const cost = costCalculator.calculate(tokens, model)

    db.saveToolCall({
      sessionId: tokenTracker.getSessionId(),
      tool: input.tool,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cost,
      model: tokens.model || model.id,
      timestamp: Date.now(),
    })

    logger.debug('tool.execute.after', { tool: input.tool, tokens, cost })
  } catch (err) {
    logger.error('Error in toolAfter hook', err)
  }
}
