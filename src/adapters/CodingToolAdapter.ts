import type { Model } from '../services/ModelRegistry.js'

export interface TaskRequest {
  role: string
  model: Model
  prompt: string
  maxTokens?: number
  cwd?: string
}

export interface TaskResult {
  output: string
  inputTokens: number
  outputTokens: number
  model: string
  durationMs: number
  success: boolean
  error?: string
  raw?: unknown
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  model?: string
}

export interface CodingToolAdapter {
  name: string
  detect(): Promise<boolean>
  getModels(): Promise<Model[]>
  runTask(task: TaskRequest): Promise<TaskResult>
  getUsage(result: TaskResult): Promise<Usage>
  supportsPatchPreview(): boolean
  supportsReviewMode(): boolean
}
