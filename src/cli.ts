#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline, { type Interface as ReadlineInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { BCS_WELCOME_LOGO, BCS_WELCOME_TAGLINE } from './tui/logo.js'

const args = process.argv.slice(2)
const command = args[0]

const BCS_COMMANDS: Record<string, { description: string; template: string }> = {
  'bcs': {
    description: 'Better Code Soul web dashboard ac',
    template: 'Call the bcs tool to open the web dashboard.',
  },
  'bcs-status': {
    description: 'Better Code Soul genel durum ozeti',
    template: 'Call the bcs_status tool and return only its output.',
  },
  'bcs-tokens': {
    description: 'Better Code Soul token ve maliyet raporu',
    template: 'Call the bcs_tokens tool with period set to "$ARGUMENTS" if provided, otherwise "session". Return only its output.',
  },
  'bcs-models': {
    description: 'Better Code Soul model ve auth durumu',
    template: 'Call the bcs_models tool with filter set to "$ARGUMENTS" if provided, otherwise "all". Return only its output.',
  },
  'bcs-graphify': {
    description: 'Graphify hafiza sistemi yonetimi',
    template: 'Call the bcs_graphify tool with action set to "$ARGUMENTS" if provided, otherwise "status". Return only its output.',
  },
  'bcs-context-mode': {
    description: 'Context Mode token tasarrufu yonetimi',
    template: 'Call the bcs_context_mode tool with action set to "$ARGUMENTS" if provided, otherwise "status". Return only its output.',
  },
  'bcs-optimize': {
    description: 'Better Code Soul optimizasyon onerileri',
    template: 'Call the bcs_optimize tool and return only its output.',
  },
  'bcs-doctor': {
    description: 'Better Code Soul kurulum ve saglik kontrolu',
    template: 'Call the bcs_doctor tool and return only its output.',
  },
  'bcs-quality': {
    description: 'Better Code Soul kalite ve basari raporu',
    template: 'Call the bcs_quality tool with period set to "$ARGUMENTS" if provided, otherwise "month". Return only its output.',
  },
  'bcs-router': {
    description: 'Better Code Soul ogrenerek model secen router raporu',
    template: 'Call the bcs_router tool with period set to "$ARGUMENTS" if provided, otherwise "month". Return only its output.',
  },
  'bcs-agent': {
    description: 'Gorevi paralel subagentlara dagit',
    template: 'Call the bcs_agent tool with request set to "$ARGUMENTS". Return only its output.',
  },
}

function getConfigPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
}

function getHubDataPath(): string {
  return path.join(os.homedir(), '.better-code-soul')
}

function isBetterCodeSoulPlugin(entry: unknown): boolean {
  const plugin = Array.isArray(entry) ? entry[0] : entry
  if (typeof plugin !== 'string') return false

  if (plugin === 'better-code-soul' || plugin.startsWith('better-code-soul@')) {
    return true
  }

  if (plugin.startsWith('file://')) {
    try {
      const pluginPath = path.resolve(fileURLToPath(plugin))
      const localDist = path.resolve(process.cwd(), 'dist', 'index.mjs')
      return pluginPath === localDist && fs.existsSync(pluginPath)
    } catch {
      return false
    }
  }

  return false
}

async function setup(): Promise<void> {
  const { bcsConfigService } = await import('./services/BcsConfigService.js')
  const { toolRegistryService } = await import('./services/ToolRegistryService.js')
  const autoYes = args.includes('--yes') || args.includes('-y') || !process.stdin.isTTY

  console.log(BCS_WELCOME_LOGO)
  console.log(`\n${BCS_WELCOME_TAGLINE}\n`)
  console.log('Global setup: detecting coding tools...\n')

  let globalConfig = await toolRegistryService.refreshGlobalRegistry({ enableAvailable: autoYes })
  globalConfig = await selectToolsIfInteractive(globalConfig, autoYes)
  bcsConfigService.saveGlobalConfig(globalConfig)

  console.log(toolRegistryService.formatTools(globalConfig))

  const openCodeEnabled = globalConfig.tools.opencode?.enabled
  if (openCodeEnabled) {
    registerOpenCodeCommands()
  } else {
    console.log('\nOpenCode adapter is disabled. You can enable it later with: bcs tools enable opencode')
  }

  ensureGlobalDataDirs()

  console.log('\nSetup complete.')
  console.log('Next: cd into a repo and run `bcs init`.')
  if (openCodeEnabled) console.log('OpenCode users: restart OpenCode, then run `/bcs-doctor`.')
}

function registerOpenCodeCommands(): void {
  console.log('\nRegistering OpenCode plugin and slash commands...')

  const configPath = getConfigPath()
  const configDir = path.dirname(configPath)

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  let config: Record<string, unknown> & {
    plugin?: unknown[]
    command?: Record<string, { description: string; template: string; prompt?: string }>
  } = {}
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      config = {}
    }
  }

  if (!config.plugin) {
    config.plugin = []
  }
  if (!Array.isArray(config.plugin)) {
    config.plugin = [config.plugin]
  }
  let changed = false
  if (!config.$schema) {
    config.$schema = 'https://opencode.ai/config.json'
    changed = true
  }
  if (!config.plugin.some(isBetterCodeSoulPlugin)) {
    config.plugin.push('better-code-soul')
    changed = true
    console.log('  Added "better-code-soul" to opencode.json plugins')
  } else {
    console.log('  "better-code-soul" already registered in opencode.json')
  }

  if (!config.command || typeof config.command !== 'object' || Array.isArray(config.command)) {
    config.command = {}
    changed = true
  }
  for (const [name, commandConfig] of Object.entries(BCS_COMMANDS)) {
    const current = config.command[name]
    if (!current || current.description !== commandConfig.description || current.template !== commandConfig.template || current.prompt) {
      config.command[name] = commandConfig
      changed = true
      console.log(`  Registered /${name}`)
    }
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  console.log(`  OpenCode config: ${configPath}`)
}

function ensureGlobalDataDirs(): void {
  const hubData = getHubDataPath()
  if (!fs.existsSync(hubData)) {
    fs.mkdirSync(hubData, { recursive: true })
  }
  const logsDir = path.join(hubData, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  console.log(`  Data directory: ${hubData}`)
}

async function selectToolsIfInteractive(config: import('./services/BcsConfigService.js').GlobalBcsConfig, autoYes: boolean): Promise<import('./services/BcsConfigService.js').GlobalBcsConfig> {
  if (autoYes) return config

  const { CODING_TOOL_DEFINITIONS } = await import('./services/ToolRegistryService.js')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    console.log('Select coding tools to connect. Press Enter to accept defaults.\n')
    for (const definition of CODING_TOOL_DEFINITIONS) {
      const current = config.tools[definition.id]
      const defaultEnabled = current?.enabled || current?.status === 'available'
      const suffix = current?.status === 'available' ? 'available' : 'not installed'
      const answer = await ask(rl, `Enable ${definition.label}? ${defaultEnabled ? '[Y/n]' : '[y/N]'} (${suffix}) `)
      const normalized = answer.trim().toLowerCase()
      const enabled = normalized ? ['y', 'yes', 'e', 'evet'].includes(normalized) : defaultEnabled
      config.tools[definition.id] = {
        enabled,
        command: current?.command || definition.command,
        status: current?.status || 'unknown',
        label: definition.label,
        detectedAt: current?.detectedAt,
      }
    }

    const enabledAvailable = CODING_TOOL_DEFINITIONS.find((definition) => config.tools[definition.id]?.enabled && config.tools[definition.id]?.status === 'available')
    const enabled = CODING_TOOL_DEFINITIONS.find((definition) => config.tools[definition.id]?.enabled)
    config.defaultTool = enabledAvailable?.id || enabled?.id || config.defaultTool
    return config
  } finally {
    rl.close()
  }
}

function ask(rl: ReadlineInterface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

async function status(): Promise<void> {
  const { bcsConfigService } = await import('./services/BcsConfigService.js')
  const { toolRegistryService } = await import('./services/ToolRegistryService.js')
  const hubData = getHubDataPath()
  const dbPath = path.join(hubData, 'data.db')
  const configPath = getConfigPath()
  const globalConfig = bcsConfigService.loadGlobalConfig()
  const projectConfig = bcsConfigService.loadProjectConfig(process.cwd())

  console.log('Better Code Soul Status\n')
  console.log('Global')
  console.log(`  Data dir:      ${hubData} ${fs.existsSync(hubData) ? 'OK' : 'MISSING'}`)
  console.log(`  Global config: ${path.join(hubData, 'config.json')} ${fs.existsSync(path.join(hubData, 'config.json')) ? 'OK' : 'MISSING'}`)
  console.log(`  Global DB:     ${dbPath} ${fs.existsSync(dbPath) ? 'OK' : 'MISSING'}`)
  console.log(`  Default tool:  ${globalConfig.defaultTool || 'not set'}`)

  console.log('\nProject')
  console.log(`  Config:        ${path.join(process.cwd(), '.bcs.json')} ${projectConfig ? 'OK' : 'MISSING'}`)
  console.log(`  Project DB:    ${path.join(process.cwd(), '.bcs', 'history.db')} ${fs.existsSync(path.join(process.cwd(), '.bcs', 'history.db')) ? 'OK' : 'MISSING'}`)
  console.log(`  Default tool:  ${projectConfig?.defaultTool || '(run bcs init)'}`)

  console.log('\nTools')
  for (const definition of toolRegistryService.listDefinitions()) {
    const tool = globalConfig.tools[definition.id]
    console.log(`  ${definition.id.padEnd(8)} ${tool?.enabled ? 'enabled ' : 'disabled'} ${tool?.status || 'unknown'}`)
  }

  console.log('\nOpenCode')
  console.log(`  Config:   ${configPath} ${fs.existsSync(configPath) ? 'OK' : 'MISSING'}`)

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const plugins = Array.isArray(config.plugin) ? config.plugin : [config.plugin]
      const registered = plugins.some(isBetterCodeSoulPlugin)
      console.log(`  Plugin:   ${registered ? 'Registered' : 'NOT registered'}`)
      const commands = config.command && typeof config.command === 'object' ? config.command : {}
      const missingCommands = Object.keys(BCS_COMMANDS).filter((name) => !(name in commands))
      console.log(`  Commands: ${missingCommands.length === 0 ? 'Registered' : `Missing ${missingCommands.map((name) => `/${name}`).join(', ')}`}`)
    } catch {
      console.log('  Plugin:   Could not read config')
    }
  }
}

async function initProject(): Promise<void> {
  const { bcsConfigService } = await import('./services/BcsConfigService.js')
  const { db } = await import('./services/Database.js')
  const force = args.includes('--force')
  const result = bcsConfigService.initProject(process.cwd(), { force })
  await db.init({ projectPath: process.cwd(), scope: 'project' })
  db.close()

  console.log(result.created ? 'BCS project initialized.\n' : 'BCS project already initialized.\n')
  console.log(`  Config:      ${result.configPath}`)
  console.log(`  Project dir: ${result.projectDir}`)
  console.log(`  History DB:  ${result.historyDb}`)
  console.log(`  Reports:     ${result.reportsDir}`)
  console.log(`  Checkpoints: ${result.checkpointsDir}`)
  console.log('\nProject defaults')
  console.log(`  Tool:        ${result.config.defaultTool}`)
  console.log(`  Mode:        ${result.config.mode}`)
  console.log(`  Risk:        ${result.config.risk}`)
  console.log(`  Budget:      $${result.config.budget.perTask}/task, $${result.config.budget.daily}/day`)
  console.log(`  Quality:     ${Object.values(result.config.quality).filter(Boolean).join(' · ') || 'none detected'}`)
}

async function tools(): Promise<void> {
  const { bcsConfigService } = await import('./services/BcsConfigService.js')
  const { toolRegistryService } = await import('./services/ToolRegistryService.js')
  const action = args[1] || 'list'
  const toolId = args[2]
  let config = bcsConfigService.loadGlobalConfig()

  if (action === 'detect') {
    config = await toolRegistryService.refreshGlobalRegistry()
  } else if (action === 'enable' && toolId) {
    config = toolRegistryService.setEnabled(toolId, true)
  } else if (action === 'disable' && toolId) {
    config = toolRegistryService.setEnabled(toolId, false)
  } else if ((action === 'default' || action === 'set-default') && toolId) {
    config = toolRegistryService.setDefault(toolId)
  } else if (action !== 'list' && action !== 'status') {
    console.error(`Unknown tools action: ${action}`)
    console.error('Usage: bcs tools [detect|enable <tool>|disable <tool>|default <tool>]')
    process.exit(1)
  }

  console.log(toolRegistryService.formatTools(config))
}

async function dashboard(): Promise<void> {
  const { startDashboardServer } = await import('./web/DashboardServer.js')
  const handle = await startDashboardServer({ openBrowser: true, initializeServices: true })
  console.log('Better Code Soul dashboard')
  console.log(`  URL: ${handle.url}`)
  console.log(`  Browser: ${handle.opened ? 'opened' : 'open manually'}`)
  console.log('\nPress Ctrl+C to stop the dashboard server.')
}

async function doctor(): Promise<void> {
  const { db } = await import('./services/Database.js')
  const { modelRegistry } = await import('./services/ModelRegistry.js')
  const { tokenTracker } = await import('./services/TokenTracker.js')
  const { authReader } = await import('./services/AuthReader.js')
  const { doctorService } = await import('./services/DoctorService.js')

  await db.init({ scope: args.includes('--global') ? 'global' : 'auto', projectPath: process.cwd() })
  modelRegistry.init()
  tokenTracker.init()
  modelRegistry.setAuthProviders(await authReader.getProviders(true))

  const report = await doctorService.run(process.cwd())
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(doctorService.formatMarkdown(report))
  }
  db.close()
}

async function quality(): Promise<void> {
  const { db } = await import('./services/Database.js')
  const { modelRegistry } = await import('./services/ModelRegistry.js')
  const { formatCost, formatDuration } = await import('./utils/format.js')
  const { routerLearningService } = await import('./services/RouterLearningService.js')

  await db.init()
  modelRegistry.init()

  const days = args.includes('--week') ? 7 : 30
  const summary = db.getQualitySummary(days)
  const models = db.getModelPerformanceHistory(days).slice(0, 10)
  console.log(`Quality Loop (${days} days)\n`)
  console.log(`  Runs: ${summary.totalRuns}`)
  console.log(`  Avg success score: ${summary.avgSuccessScore.toFixed(1)}/100`)
  console.log(`  Success rate: ${(summary.successRate * 100).toFixed(0)}%`)
  console.log(`  Cost / successful task: ${formatCost(summary.avgCostPerSuccessfulTask)}`)
  console.log(`  Retry rate: ${(summary.retryRate * 100).toFixed(0)}%`)
  console.log(`  Conflict rate: ${(summary.conflictRate * 100).toFixed(0)}%`)

  if (models.length > 0) {
    console.log('\nModel performance:')
    for (const model of models) {
      console.log(`  ${model.model} / ${model.role}: ${model.runs} run, ${(model.successRate * 100).toFixed(0)}%, ${formatCost(model.avgCost)}, ${formatDuration(model.avgDurationMs)}`)
    }
  }
  const router = routerLearningService.getReport(process.cwd(), days)
  console.log('\nRouter learning:')
  console.log(`  Scope: ${router.scope}`)
  console.log(`  Decisions: ${router.summary.decisions}`)
  console.log(`  Outcomes: ${router.summary.outcomes}`)
  console.log(`  Avg score: ${router.summary.avgSuccessScore.toFixed(1)}/100`)
  console.log(`  Pass rate: ${(router.summary.qualityPassRate * 100).toFixed(0)}%`)
  console.log(`  Escalations: ${router.summary.escalationCount}`)
  console.log(`  Auto reviewers: ${router.summary.autoReviewerCount}`)
  db.close()
}

async function router(): Promise<void> {
  const { db } = await import('./services/Database.js')
  const { modelRegistry } = await import('./services/ModelRegistry.js')
  const { routerLearningService } = await import('./services/RouterLearningService.js')

  await db.init()
  modelRegistry.init()

  const days = args.includes('--week') ? 7 : 30
  console.log(routerLearningService.formatReport(process.cwd(), days))
  db.close()
}

function help(): void {
  console.log(`
Better Code Soul — cost, quality and routing layer for coding agents

Usage:
  bcs setup              Global setup wizard and tool registry
  bcs tools              List/detect/enable coding tools
  bcs init               Activate BCS in the current project
  bcs status             Check global and project status
  bcs doctor             Run project install/auth/tool diagnostics
  bcs doctor --global    Run global diagnostics
  bcs quality            Show project quality loop report
  bcs router             Show project auto-improving router report
  bcs dashboard          Open web dashboard
  bcs mcp                Start MCP server (stdio)
  bcs help               Show this help

Legacy binary \`better-code-soul\` supports the same commands.

OpenCode Commands (after setup):
  /bcs                 Open web dashboard
  /bcs-status          General status summary
  /bcs-tokens [period] Token and cost report
  /bcs-models          Available models
  /bcs-agent "task"    Parallel subagent orchestration
  /bcs-graphify        Graphify memory system
  /bcs-context-mode    Context Mode management
  /bcs-optimize        Optimization suggestions
  /bcs-doctor          Install/auth/tool diagnostics
  /bcs-quality         Quality score and cost per successful task
  /bcs-router          Auto-improving router report
`)
}

switch (command) {
  case 'setup':
    setup().catch((err) => {
      console.error(`Setup failed: ${err}`)
      process.exit(1)
    })
    break
  case 'init':
    initProject().catch((err) => {
      console.error(`Project init failed: ${err}`)
      process.exit(1)
    })
    break
  case 'tools':
    tools().catch((err) => {
      console.error(`Tools command failed: ${err}`)
      process.exit(1)
    })
    break
  case 'status':
    status().catch((err) => {
      console.error(`Status failed: ${err}`)
      process.exit(1)
    })
    break
  case 'doctor':
    doctor().catch((err) => {
      console.error(`Doctor failed: ${err}`)
      process.exit(1)
    })
    break
  case 'quality':
    quality().catch((err) => {
      console.error(`Quality report failed: ${err}`)
      process.exit(1)
    })
    break
  case 'router':
    router().catch((err) => {
      console.error(`Router report failed: ${err}`)
      process.exit(1)
    })
    break
  case 'dashboard':
    dashboard().catch((err) => {
      console.error(`Dashboard failed: ${err}`)
      process.exit(1)
    })
    break
  case 'mcp':
    import('./mcp/server.js')
    break
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    help()
    break
  default:
    console.error(`Unknown command: ${command}`)
    help()
    process.exit(1)
}
