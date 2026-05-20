#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')

function getHubDataPath() {
  return path.join(os.homedir(), '.better-code-soul')
}

try {
  const hubData = getHubDataPath()
  const logsDir = path.join(hubData, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  const configPath = path.join(hubData, 'config.json')
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, tools: {}, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
  }

  console.log('Better Code Soul installed.')
  console.log('Run `bcs setup` for global tool setup, then `bcs init` inside a project.')
} catch (err) {
  console.warn('Better Code Soul postinstall: could not initialize global data directory.')
  console.warn('Run `bcs setup` manually.')
  console.warn('Error:', err.message)
}
