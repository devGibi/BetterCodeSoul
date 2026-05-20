import type { Model } from '../services/ModelRegistry.js'
import { bcsConfigService } from '../services/BcsConfigService.js'
import { getCodingToolAdapter } from '../adapters/AdapterRegistry.js'
import { logger } from '../utils/logger.js'

export type AgentType = 'planner' | 'coder' | 'reviewer' | 'researcher'

export interface AgentConfig {
  agentType: AgentType
  model: Model
  task: string
  context?: string
  outputFiles?: string[]
  maxTokens?: number
  cwd?: string
  tool?: string
}

export interface AgentResult {
  agentId: string
  output: string
  inputTokens: number
  outputTokens: number
  model: string
  durationMs: number
  success: boolean
  error?: string
}

const ROLE_PROMPTS: Record<AgentType, string> = {
  planner: 'Sen bir yazılım mimarısın. Sadece plan yap, KESİNLİKLE kod yazma.',
  coder: "Sen bir senior developer'sın. Verilen görevi implement et. Sadece istenen dosyalar.",
  reviewer: 'Sen bir code reviewer\'sın. Kısa ve net ol. Sorun varsa belirt, yoksa "ONAYLANDI" yaz.',
  researcher: 'Sen bir teknik araştırmacısın. Dokümantasyon ve örneklerden kaynak göster.',
}

export class AgentRunner {
  private app: unknown

  constructor(app?: unknown) {
    this.app = app
  }

  async run(config: AgentConfig): Promise<AgentResult> {
    const startTime = Date.now()
    const agentId = `${config.agentType}_${Date.now()}`

    try {
      logger.info(`Agent started: ${agentId}`, { model: config.model.id, type: config.agentType })
      const result = this.supportsNativeSubagent()
        ? await this.runNative(config, startTime, agentId)
        : await this.runViaCLI(config, startTime, agentId)
      logger.info(`Agent finished: ${agentId}`, {
        success: result.success,
        model: result.model,
        tokens: result.inputTokens + result.outputTokens,
        durationMs: result.durationMs,
        error: result.error,
      })
      return result
    } catch (err) {
      logger.error(`Agent ${agentId} failed`, err)
      return {
        agentId,
        output: '',
        inputTokens: 0,
        outputTokens: 0,
        model: config.model.id,
        durationMs: Date.now() - startTime,
        success: false,
        error: String(err),
      }
    }
  }

  private supportsNativeSubagent(): boolean {
    if (!this.app) return false
    const appObj = this.app as Record<string, unknown>
    return typeof appObj.runSubagent === 'function'
  }

  private async runNative(config: AgentConfig, startTime: number, agentId: string): Promise<AgentResult> {
    const appObj = this.app as Record<string, unknown>
    const runSubagent = appObj.runSubagent as (opts: {
      model: string
      prompt: string
      maxTokens?: number
    }) => Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }>

    const result = await runSubagent({
      model: config.model.id,
      prompt: this.buildPrompt(config),
      maxTokens: config.maxTokens || 3000,
    })

    return {
      agentId,
      output: result.text,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      model: config.model.id,
      durationMs: Date.now() - startTime,
      success: true,
    }
  }

  private async runViaCLI(config: AgentConfig, startTime: number, agentId: string): Promise<AgentResult> {
    const cwd = config.cwd || process.cwd()
    const toolId = config.tool || bcsConfigService.getDefaultTool(cwd)
    const adapter = getCodingToolAdapter(toolId)
    const result = await adapter.runTask({
      role: config.agentType,
      model: config.model,
      prompt: this.buildPrompt(config),
      maxTokens: config.maxTokens,
      cwd,
    })

    return {
      agentId,
      output: result.output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model === 'unknown' ? config.model.id : result.model,
      durationMs: result.durationMs || Date.now() - startTime,
      success: result.success,
      error: result.error,
    }
  }

  buildPrompt(config: AgentConfig): string {
    const rolePrompt = ROLE_PROMPTS[config.agentType]
    const parts = [
      `ROL: ${rolePrompt}`,
      '',
      config.context ? `BAĞLAM:\n${config.context}` : '',
      '',
      `GÖREV:\n${config.task}`,
      '',
      config.agentType === 'coder' ? 'CIKTI FORMATI: Degistirilecek dosyalari unified diff olarak ver. Her diff hunk dosya yolunu ve @@ satir araligini icermeli.' : '',
      '',
      'KESİNLİKLE UYULMASI GEREKEN: İlk seferde çalışan çıktı üret. Emin değilsen eksik bırak, tahmin yürütme.',
    ]

    return parts.filter(Boolean).join('\n')
  }
}
