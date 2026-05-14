import { db } from './Database.js'
import { logger } from '../utils/logger.js'
import type { Model, ModelTier } from './ModelRegistry.js'

export type Tier = 'think' | 'code' | 'review'

export interface RouterCandidate {
  modelId: string
  reason: string
  priority: number
}

export interface RouterResult {
  model: Model
  candidate: RouterCandidate
  warning?: string
}

const ROUTING_TABLE: Record<Tier, RouterCandidate[]> = {
  think: [
    { modelId: 'gemini-2.5-pro', reason: 'Geniş context + uygun fiyat ($1.25/1M)', priority: 1 },
    { modelId: 'claude-opus-4-5', reason: 'En güçlü akıl yürütme ama pahalı ($15/1M)', priority: 2 },
    { modelId: 'o3', reason: 'OpenAI reasoning — API key gerekli', priority: 3 },
  ],
  code: [
    { modelId: 'kimi-k2', reason: 'Kod için iyi · çok ucuz ($0.60/1M)', priority: 1 },
    { modelId: 'deepseek-v3', reason: 'En ucuz seçenek ($0.27/1M)', priority: 2 },
    { modelId: 'glm-4-plus', reason: 'Zhipu — iyi kod kalitesi ($0.70/1M)', priority: 3 },
    { modelId: 'claude-sonnet-4-5', reason: 'Fallback — kaliteli ama daha pahalı', priority: 4 },
    { modelId: 'gpt-4o', reason: 'OpenAI fallback', priority: 5 },
    { modelId: 'gemini-2.5-flash', reason: 'Google fallback — hızlı', priority: 6 },
  ],
  review: [
    { modelId: 'claude-haiku-4-5', reason: 'Hızlı + ucuz + kaliteli review ($0.80/1M)', priority: 1 },
    { modelId: 'gpt-4o-mini', reason: 'Çok ucuz ($0.15/1M)', priority: 2 },
    { modelId: 'gemini-2.5-flash', reason: 'Google hızlı model', priority: 3 },
  ],
}

export class ModelRouter {
  private modelRegistry: { getById(id: string): Model | undefined; getAllModels(): Model[] }

  constructor(modelRegistry: { getById(id: string): Model | undefined; getAllModels(): Model[] }) {
    this.modelRegistry = modelRegistry
  }

  route(tier: Tier, connectedModelIds: string[]): RouterResult {
    const candidates = ROUTING_TABLE[tier].sort((a, b) => a.priority - b.priority)
    const connectedSet = new Set(connectedModelIds)

    for (const candidate of candidates) {
      if (connectedSet.has(candidate.modelId)) {
        const model = this.modelRegistry.getById(candidate.modelId)
        if (model) {
          return { model, candidate }
        }
      }
    }

    const fallback = candidates[0]
    const model = this.modelRegistry.getById(fallback.modelId)
    if (!model) {
      const anyModel = this.modelRegistry.getAllModels().find(m => m.tier === tier)
      if (anyModel) {
        return {
          model: anyModel,
          candidate: { ...fallback, reason: fallback.reason + ' [BAĞLI DEĞİL — fallback]' },
          warning: `${tier} tier için bağlı model bulunamadı, katalog fallback kullanılıyor`,
        }
      }
      return {
        model: { id: 'unknown', name: 'Unknown', provider: 'unknown', tier, contextWindow: 128000, inputPrice: 3, outputPrice: 15, authMethod: [] },
        candidate: fallback,
        warning: `${tier} tier için hiçbir model bulunamadı`,
      }
    }

    return {
      model,
      candidate: { ...fallback, reason: fallback.reason + ' [BAĞLI DEĞİL — fallback]' },
      warning: `${tier} tier için bağlı model bulunamadı, katalog fallback kullanılıyor`,
    }
  }

  explainRouting(): string {
    const lines = ['## Model Router — Mevcut Öncelik Sırası\n']
    for (const [tier, candidates] of Object.entries(ROUTING_TABLE) as [Tier, RouterCandidate[]][]) {
      lines.push(`### ${tier.toUpperCase()}`)
      candidates.forEach((c, i) => {
        lines.push(`${i + 1}. \`${c.modelId}\` — ${c.reason}`)
      })
      lines.push('')
    }
    lines.push('Yeni model eklemek için: `src/services/ModelRouter.ts` dosyasına satır ekle.')
    return lines.join('\n')
  }

  routeAndLog(tier: Tier, connectedModelIds: string[], sessionId?: string): RouterResult {
    const result = this.route(tier, connectedModelIds)

    db.saveRoutingLog({
      sessionId,
      tier,
      selectedModel: result.model.id,
      reason: result.candidate.reason,
      connectedModels: connectedModelIds,
      timestamp: Date.now(),
    })

    if (result.warning) {
      logger.warn(result.warning)
    }

    return result
  }
}

export const ROUTING_TABLE_EXPORT = ROUTING_TABLE
