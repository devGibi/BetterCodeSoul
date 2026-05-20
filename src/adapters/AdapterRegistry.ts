import type { CodingToolAdapter } from './CodingToolAdapter.js'
import { OpenCodeAdapter } from './OpenCodeAdapter.js'

const opencodeAdapter = new OpenCodeAdapter()

export function getCodingToolAdapter(toolId: string): CodingToolAdapter {
  switch (toolId) {
    case 'opencode':
      return opencodeAdapter
    default:
      return new UnsupportedAdapter(toolId)
  }
}

class UnsupportedAdapter implements CodingToolAdapter {
  name: string

  constructor(name: string) {
    this.name = name
  }

  async detect(): Promise<boolean> {
    return false
  }

  async getModels() {
    return []
  }

  async runTask() {
    return {
      output: '',
      inputTokens: 0,
      outputTokens: 0,
      model: 'unknown',
      durationMs: 0,
      success: false,
      error: `Adapter "${this.name}" is registered but task execution is not implemented yet. Use \`bcs tools default opencode\` for execution today.`,
    }
  }

  async getUsage() {
    return { inputTokens: 0, outputTokens: 0 }
  }

  supportsPatchPreview(): boolean {
    return false
  }

  supportsReviewMode(): boolean {
    return false
  }
}
