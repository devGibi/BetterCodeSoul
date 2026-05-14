#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runCommand } from './utils/spawn.js'

const args = process.argv.slice(2)
const command = args[0]

function getConfigPath(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'opencode', 'opencode.json')
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'opencode', 'opencode.json')
    default:
      return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
  }
}

function getHubDataPath(): string {
  return path.join(os.homedir(), '.better-code-soul')
}

function setup(): void {
  console.log('Setting up Better Code Soul...\n')

  const configPath = getConfigPath()
  const configDir = path.dirname(configPath)

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  let config: Record<string, unknown> & { plugin?: string[] } = {}
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
  if (!config.plugin.includes('better-code-soul')) {
    config.plugin.push('better-code-soul')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('  Added "better-code-soul" to opencode.json plugins')
  } else {
    console.log('  "better-code-soul" already registered in opencode.json')
  }

  const hubData = getHubDataPath()
  if (!fs.existsSync(hubData)) {
    fs.mkdirSync(hubData, { recursive: true })
  }
  const logsDir = path.join(hubData, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  console.log(`  Data directory: ${hubData}`)
  console.log(`  Config: ${configPath}`)
  console.log('\nSetup complete. Restart OpenCode, then run: /bcs-status')
}

function status(): void {
  const hubData = getHubDataPath()
  const dbPath = path.join(hubData, 'data.db')
  const configPath = getConfigPath()

  console.log('Better Code Soul Status\n')
  console.log(`  Data dir: ${hubData} ${fs.existsSync(hubData) ? 'OK' : 'MISSING'}`)
  console.log(`  Database: ${dbPath} ${fs.existsSync(dbPath) ? 'OK' : 'MISSING'}`)
  console.log(`  Config:   ${configPath} ${fs.existsSync(configPath) ? 'OK' : 'MISSING'}`)

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const plugins = Array.isArray(config.plugin) ? config.plugin : [config.plugin]
      const registered = plugins.includes('better-code-soul')
      console.log(`  Plugin:   ${registered ? 'Registered' : 'NOT registered'}`)
    } catch {
      console.log('  Plugin:   Could not read config')
    }
  }
}

function help(): void {
  console.log(`
Better Code Soul — OpenCode plugin for token tracking and parallel subagent orchestration

Usage:
  better-code-soul setup     Register plugin with OpenCode
  better-code-soul status    Check installation status
  better-code-soul mcp       Start MCP server (stdio)
  better-code-soul help      Show this help

OpenCode Commands (after setup):
  /bcs-status          General status summary
  /bcs-tokens [period] Token and cost report
  /bcs-models          Available models
  /bcs-agent "task"    Parallel subagent orchestration
  /bcs-graphify        Graphify memory system
  /bcs-context-mode    Context Mode management
  /bcs-optimize        Optimization suggestions
`)
}

switch (command) {
  case 'setup':
    setup()
    break
  case 'status':
    status()
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
