import { commandExists } from '../utils/spawn.js'
import { bcsConfigService, type GlobalBcsConfig, type GlobalToolConfig } from './BcsConfigService.js'

export interface CodingToolDefinition {
  id: string
  label: string
  command: string
  adapter: string
}

export const CODING_TOOL_DEFINITIONS: CodingToolDefinition[] = [
  { id: 'opencode', label: 'OpenCode CLI', command: 'opencode', adapter: 'opencode' },
  { id: 'codex', label: 'Codex CLI', command: 'codex', adapter: 'codex' },
  { id: 'claude', label: 'Claude Code', command: 'claude', adapter: 'claude' },
  { id: 'cursor', label: 'Cursor CLI', command: 'cursor', adapter: 'cursor' },
  { id: 'aider', label: 'Aider', command: 'aider', adapter: 'aider' },
  { id: 'custom', label: 'Custom command', command: 'custom', adapter: 'custom' },
]

export class ToolRegistryService {
  listDefinitions(): CodingToolDefinition[] {
    return CODING_TOOL_DEFINITIONS
  }

  async detectTools(): Promise<Record<string, GlobalToolConfig>> {
    const entries: Record<string, GlobalToolConfig> = {}
    const detectedAt = new Date().toISOString()

    for (const tool of CODING_TOOL_DEFINITIONS) {
      const available = await commandExists(tool.command)
      entries[tool.id] = {
        enabled: false,
        command: tool.command,
        status: available ? 'available' : 'not_installed',
        label: tool.label,
        detectedAt,
      }
    }

    return entries
  }

  async refreshGlobalRegistry(options: { enableAvailable?: boolean } = {}): Promise<GlobalBcsConfig> {
    const current = bcsConfigService.loadGlobalConfig()
    const detected = await this.detectTools()
    const tools: Record<string, GlobalToolConfig> = { ...current.tools }

    for (const [id, detectedTool] of Object.entries(detected)) {
      const existing = current.tools[id]
      tools[id] = {
        ...detectedTool,
        command: existing?.command || detectedTool.command,
        enabled: existing?.enabled ?? Boolean(options.enableAvailable && detectedTool.status === 'available'),
      }
    }

    const defaultTool = current.defaultTool && tools[current.defaultTool]?.enabled
      ? current.defaultTool
      : this.pickDefaultTool(tools)
    const next = { version: 1, tools, defaultTool, updatedAt: new Date().toISOString() }
    bcsConfigService.saveGlobalConfig(next)
    return next
  }

  setEnabled(toolId: string, enabled: boolean): GlobalBcsConfig {
    const config = bcsConfigService.loadGlobalConfig()
    const definition = CODING_TOOL_DEFINITIONS.find((tool) => tool.id === toolId)
    const existing = config.tools[toolId]
    config.tools[toolId] = {
      enabled,
      command: existing?.command || definition?.command || toolId,
      status: existing?.status || 'unknown',
      label: existing?.label || definition?.label || toolId,
      detectedAt: existing?.detectedAt,
    }
    if (enabled && !config.defaultTool) config.defaultTool = toolId
    if (!enabled && config.defaultTool === toolId) config.defaultTool = this.pickDefaultTool(config.tools)
    bcsConfigService.saveGlobalConfig(config)
    return config
  }

  setDefault(toolId: string): GlobalBcsConfig {
    const config = bcsConfigService.loadGlobalConfig()
    if (!config.tools[toolId]) {
      const definition = CODING_TOOL_DEFINITIONS.find((tool) => tool.id === toolId)
      config.tools[toolId] = {
        enabled: true,
        command: definition?.command || toolId,
        status: 'unknown',
        label: definition?.label || toolId,
      }
    }
    config.tools[toolId].enabled = true
    config.defaultTool = toolId
    bcsConfigService.saveGlobalConfig(config)
    return config
  }

  formatTools(config: GlobalBcsConfig): string {
    const lines = [
      '## BCS Coding Tools',
      '',
      `Default tool: ${config.defaultTool || 'not set'}`,
      '',
      '| Tool | Enabled | Command | Status |',
      '|---|---:|---|---|',
    ]

    for (const definition of CODING_TOOL_DEFINITIONS) {
      const tool = config.tools[definition.id] || { enabled: false, command: definition.command, status: 'unknown', label: definition.label }
      lines.push(`| ${definition.label} | ${tool.enabled ? 'yes' : 'no'} | \`${tool.command}\` | ${tool.status} |`)
    }

    lines.push('', 'Manage: `bcs tools detect`, `bcs tools enable opencode`, `bcs tools disable codex`, `bcs tools default opencode`')
    return lines.join('\n')
  }

  private pickDefaultTool(tools: Record<string, GlobalToolConfig>): string | undefined {
    const enabledAvailable = CODING_TOOL_DEFINITIONS.find((definition) => tools[definition.id]?.enabled && tools[definition.id]?.status === 'available')
    if (enabledAvailable) return enabledAvailable.id
    const enabled = CODING_TOOL_DEFINITIONS.find((definition) => tools[definition.id]?.enabled)
    return enabled?.id
  }
}

export const toolRegistryService = new ToolRegistryService()
