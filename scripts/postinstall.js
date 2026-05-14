#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')

function getConfigPath() {
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'opencode', 'opencode.json')
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'opencode', 'opencode.json')
    default:
      return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
  }
}

function getHubDataPath() {
  return path.join(os.homedir(), '.better-code-soul')
}

try {
  const configPath = getConfigPath()
  const configDir = path.dirname(configPath)

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  let config = {}
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
  }

  const hubData = getHubDataPath()
  if (!fs.existsSync(hubData)) {
    fs.mkdirSync(hubData, { recursive: true })
  }
  const logsDir = path.join(hubData, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  console.log('\x1b[32m%s\x1b[0m', '✅ Better Code Soul installed successfully.')
  console.log('   Restart OpenCode, then run: /bcs-status')
} catch (err) {
  console.warn('\x1b[33m%s\x1b[0m', '⚠ Better Code Soul postinstall: could not auto-register plugin.')
  console.warn('   Manual setup: add "better-code-soul" to your opencode.json "plugin" array.')
  console.warn('   Error:', err.message)
}
