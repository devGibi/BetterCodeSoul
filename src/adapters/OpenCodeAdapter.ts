import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commandExists, runCommand } from '../utils/spawn.js'
import { modelRegistry } from '../services/ModelRegistry.js'
import type { CodingToolAdapter, TaskRequest, TaskResult, Usage } from './CodingToolAdapter.js'

export class OpenCodeAdapter implements CodingToolAdapter {
  name = 'opencode'

  detect(): Promise<boolean> {
    return commandExists('opencode')
  }

  async getModels() {
    const connected = modelRegistry.getConnectedModels()
    return connected.length > 0 ? connected : modelRegistry.getAllModels()
  }

  async runTask(task: TaskRequest): Promise<TaskResult> {
    const startTime = Date.now()
    const promptFile = path.join(os.tmpdir(), `bcs-agent-${Date.now()}.txt`)
    await fs.promises.writeFile(promptFile, task.prompt, 'utf-8')

    try {
      const result = await runCommand('opencode', [
        '--model', task.model.id,
        '--no-interactive',
        '--prompt-file', promptFile,
        '--max-tokens', String(task.maxTokens || 3000),
        '--output', 'json',
      ], { cwd: task.cwd, timeout: 300_000 })

      if (result.exitCode !== 0) {
        return {
          output: '',
          inputTokens: 0,
          outputTokens: 0,
          model: task.model.id,
          durationMs: Date.now() - startTime,
          success: false,
          error: compactError(result.stderr || result.stdout || `opencode exited with ${result.exitCode}`),
        }
      }

      const parsed = parseOpenCodeJson(result.stdout)
      return {
        output: parsed.text || parsed.content || result.stdout,
        inputTokens: parsed.usage?.input_tokens || parsed.usage?.inputTokens || 0,
        outputTokens: parsed.usage?.output_tokens || parsed.usage?.outputTokens || 0,
        model: task.model.id,
        durationMs: Date.now() - startTime,
        success: true,
        raw: parsed,
      }
    } finally {
      await fs.promises.unlink(promptFile).catch(() => {})
    }
  }

  async getUsage(result: TaskResult): Promise<Usage> {
    return {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    }
  }

  supportsPatchPreview(): boolean {
    return true
  }

  supportsReviewMode(): boolean {
    return true
  }
}

function parseOpenCodeJson(stdout: string): { text?: string; content?: string; usage?: { input_tokens?: number; output_tokens?: number; inputTokens?: number; outputTokens?: number } } {
  try {
    return JSON.parse(stdout)
  } catch {
    return { text: stdout }
  }
}

function compactError(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 1000)
}
