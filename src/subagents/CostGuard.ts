import { db } from '../services/Database.js'
import { formatCost } from '../utils/format.js'
import { logger } from '../utils/logger.js'

export class CostGuard {
  async check(estimatedCost: number): Promise<{ approved: boolean; reason?: string }> {
    const dailyLimit = parseFloat(db.getSetting('dailyLimit') || '10.0')
    const autoApproveLimit = parseFloat(db.getSetting('autoApproveLimit') || '0.10')
    const todaySpent = db.getTodayCost()
    const remaining = dailyLimit - todaySpent

    if (estimatedCost < 0.01) {
      logger.debug('CostGuard: auto-approved (< $0.01)')
      return { approved: true }
    }

    if (estimatedCost < autoApproveLimit) {
      logger.debug(`CostGuard: auto-approved (< ${formatCost(autoApproveLimit)} limit)`)
      return { approved: true }
    }

    if (estimatedCost > remaining) {
      const msg = `Daily limit exceeded. Estimated: ${formatCost(estimatedCost)}, Remaining: ${formatCost(remaining)}`
      logger.warn(msg)
      return { approved: false, reason: msg }
    }

    logger.info(`CostGuard: estimated ${formatCost(estimatedCost)} within budget`)
    return { approved: true }
  }

  async updateLimits(dailyLimit?: number, autoApproveLimit?: number): Promise<void> {
    if (dailyLimit !== undefined) {
      db.updateSetting('dailyLimit', dailyLimit.toString())
    }
    if (autoApproveLimit !== undefined) {
      db.updateSetting('autoApproveLimit', autoApproveLimit.toString())
    }
  }

  getLimits(): { dailyLimit: number; autoApproveLimit: number; todaySpent: number } {
    return {
      dailyLimit: parseFloat(db.getSetting('dailyLimit') || '10.0'),
      autoApproveLimit: parseFloat(db.getSetting('autoApproveLimit') || '0.10'),
      todaySpent: db.getTodayCost(),
    }
  }
}

export const costGuard = new CostGuard()
