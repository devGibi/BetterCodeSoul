import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runCommand } from '../utils/spawn.js'
import type { Model, ModelTier } from '../services/ModelRegistry.js'
import { logger } from '../utils/logger.js'

export type AgentType = 'planner' | 'coder' | 'reviewer' | 'researcher'

export interface AgentConfig {
  agentType: AgentType
  model: Model
  task: string
  context?: string
  outputFiles?: string[]
  maxTokens?: number
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
      if (this.supportsNativeSubagent()) {
        return await this.runNative(config, startTime, agentId)
      }
      return await this.runViaCLI(config, startTime, agentId)
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
    const promptFile = path.join(os.tmpdir(), `bcs-agent-${Date.now()}.txt`)
    await fs.promises.writeFile(promptFile, this.buildPrompt(config), 'utf-8')

    try {
      const result = await runCommand('opencode', [
        '--model', config.model.id,
        '--no-interactive',
        '--prompt-file', promptFile,
        '--max-tokens', String(config.maxTokens || 3000),
        '--output', 'json',
      ], { timeout: 300_000 })

      if (result.exitCode !== 0) {
        return {
          agentId,
          output: '',
          inputTokens: 0,
          outputTokens: 0,
          model: config.model.id,
          durationMs: Date.now() - startTime,
          success: false,
          error: result.stderr,
        }
      }

      let parsed: { text?: string; content?: string; usage?: { input_tokens?: number; output_tokens?: number } }
      try {
        parsed = JSON.parse(result.stdout)
      } catch {
        parsed = { text: result.stdout }
      }

      return {
        agentId,
        output: parsed.text || parsed.content || result.stdout,
        inputTokens: parsed.usage?.input_tokens || 0,
        outputTokens: parsed.usage?.output_tokens || 0,
        model: config.model.id,
        durationMs: Date.now() - startTime,
        success: true,
      }
    } finally {
      await fs.promises.unlink(promptFile).catch(() => {})
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
      'KESİNLİKLE UYULMASI GEREKEN: İlk seferde çalışan çıktı üret. Emin değilsen eksik bırak, tahmin yürütme.',
    ]

    return parts.filter(Boolean).join('\n')
  }
}
