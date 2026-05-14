import { db } from '../services/Database.js'
import { logger } from '../utils/logger.js'

export async function onSessionCompact(session: unknown): Promise<void> {
  try {
    const sessionId = `session_${Date.now()}`
    const snapshot = typeof session === 'string' ? session : JSON.stringify(session || {})
    db.saveSessionSnapshot(sessionId, snapshot)
    logger.debug('Session compacted, snapshot saved')
  } catch (err) {
    logger.error('Error in sessionCompact hook', err)
  }
}
