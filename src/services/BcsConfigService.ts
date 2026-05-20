import fs from 'node:fs'
import path from 'node:path'
import { paths } from '../utils/platform.js'
import { projectCommandDetector } from './ProjectCommandDetector.js'

export type ToolStatus = 'available' | 'not_installed' | 'unknown'
export type ProjectMode = 'economy' | 'balanced' | 'quality'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface GlobalToolConfig {
  enabled: boolean
  command: string
  status: ToolStatus
  label?: string
  detectedAt?: string
}

export interface GlobalBcsConfig {
  version: number
  defaultTool?: string
  tools: Record<string, GlobalToolConfig>
  updatedAt: string
}

export interface ProjectQualityConfig {
  test?: string
  lint?: string
  build?: string
  typecheck?: string
}

export interface ProjectBcsConfig {
  version: number
  defaultTool: string
  mode: ProjectMode
  risk: RiskLevel
  budget: {
    perTask: number
    daily: number
  }
  quality: ProjectQualityConfig
  routing: {
    simple: string
    medium: string
    complex: string
  }
  createdAt: string
  updatedAt: string
}

export interface ProjectInitResult {
  created: boolean
  configPath: string
  projectDir: string
  historyDb: string
  checkpointsDir: string
  reportsDir: string
  config: ProjectBcsConfig
}

const DEFAULT_GLOBAL_CONFIG: GlobalBcsConfig = {
  version: 1,
  tools: {},
  updatedAt: new Date(0).toISOString(),
}

export class BcsConfigService {
  loadGlobalConfig(): GlobalBcsConfig {
    const configPath = paths.globalConfig()
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_GLOBAL_CONFIG, updatedAt: new Date().toISOString() }
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<GlobalBcsConfig>
      return {
        version: parsed.version || 1,
        defaultTool: parsed.defaultTool,
        tools: parsed.tools || {},
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      }
    } catch {
      return { ...DEFAULT_GLOBAL_CONFIG, updatedAt: new Date().toISOString() }
    }
  }

  saveGlobalConfig(config: GlobalBcsConfig): void {
    const configPath = paths.globalConfig()
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
  }

  isProjectInitialized(projectPath = process.cwd()): boolean {
    return fs.existsSync(paths.projectConfig(projectPath))
  }

  loadProjectConfig(projectPath = process.cwd()): ProjectBcsConfig | null {
    const configPath = paths.projectConfig(projectPath)
    if (!fs.existsSync(configPath)) return null

    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ProjectBcsConfig
    } catch {
      return null
    }
  }

  initProject(projectPath = process.cwd(), options: { defaultTool?: string; force?: boolean } = {}): ProjectInitResult {
    const configPath = paths.projectConfig(projectPath)
    const projectDir = paths.projectDir(projectPath)
    const historyDb = paths.projectDb(projectPath)
    const checkpointsDir = paths.projectCheckpoints(projectPath)
    const reportsDir = paths.projectReports(projectPath)
    const existing = this.loadProjectConfig(projectPath)
    const created = !existing || Boolean(options.force)

    fs.mkdirSync(projectDir, { recursive: true })
    fs.mkdirSync(checkpointsDir, { recursive: true })
    fs.mkdirSync(reportsDir, { recursive: true })

    const config = created
      ? this.createDefaultProjectConfig(projectPath, options.defaultTool || this.getDefaultTool())
      : existing

    if (created) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    }

    return { created, configPath, projectDir, historyDb, checkpointsDir, reportsDir, config }
  }

  createDefaultProjectConfig(projectPath = process.cwd(), defaultTool = 'opencode'): ProjectBcsConfig {
    const profile = projectCommandDetector.detect(projectPath)
    const commands = profile.primary?.commands || {}
    const testCommand = commands.testRun || commands.test
    const now = new Date().toISOString()

    return {
      version: 1,
      defaultTool,
      mode: 'balanced',
      risk: 'medium',
      budget: {
        perTask: 0.25,
        daily: 5,
      },
      quality: removeUndefined({
        test: testCommand?.display,
        lint: commands.lint?.display,
        build: commands.build?.display,
        typecheck: commands.typecheck?.display,
      }),
      routing: {
        simple: 'cheap-first',
        medium: 'cheap-first-with-review',
        complex: 'planner-coder-reviewer',
      },
      createdAt: now,
      updatedAt: now,
    }
  }

  getDefaultTool(projectPath = process.cwd()): string {
    const projectConfig = this.loadProjectConfig(projectPath)
    if (projectConfig?.defaultTool) return projectConfig.defaultTool

    const globalConfig = this.loadGlobalConfig()
    if (globalConfig.defaultTool) return globalConfig.defaultTool

    const firstEnabled = Object.entries(globalConfig.tools).find(([, tool]) => tool.enabled && tool.status === 'available')
    return firstEnabled?.[0] || 'opencode'
  }
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

export const bcsConfigService = new BcsConfigService()
