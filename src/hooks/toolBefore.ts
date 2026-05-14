import { tokenTracker } from '../services/TokenTracker.js'
import { db } from '../services/Database.js'
import { logger } from '../utils/logger.js'

export async function onToolBefore(input: { tool: string; input: unknown }): Promise<void> {
  try {
    tokenTracker.recordToolStart(input.tool, input.input)
    logger.debug('tool.execute.before', { tool: input.tool })
  } catch (err) {
    logger.error('Error in toolBefore hook', err)
  }
}
