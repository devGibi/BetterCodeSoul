import fs from 'node:fs'
import path from 'node:path'
import { commandExists, runCommand, streamCommand } from '../utils/spawn.js'
import { configPatcher } from './ConfigPatcher.js'
import { db } from './Database.js'
import { logger } from '../utils/logger.js'

export interface ContextModeStats {
  installed: boolean
  active: boolean
  savedThisSession: string
  savedTotal: string
  efficiencyPercent: number
}

export class ContextModeService {
  async isInstalled(): Promise<boolean> {
    if (await commandExists('context-mode')) return true
    try {
      const result = await runCommand('npx', ['context-mode', '--version'], { timeout: 10000 })
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  isActive(projectPath: string): boolean {
    const configPath = configPatcher.findOpencodeJson(projectPath)
    if (!configPath) return false

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (Array.isArray(config.plugin) && config.plugin.includes('context-mode')) return true
      if (config.mcp && config.mcp['context-mode']) return true
    } catch {
      // ignore
    }

    return false
  }

  async *install(): AsyncGenerator<string> {
    yield 'Installing context-mode...'

    for await (const line of streamCommand('npm', ['install', '-g', 'context-mode'])) {
      yield line
    }

    const installed = await this.isInstalled()
    if (installed) {
      yield 'context-mode installed successfully.'
    } else {
      yield 'ERROR: context-mode installation failed.'
    }
  }

  enable(projectPath: string): void {
    const configPath = configPatcher.findOpencodeJson(projectPath) || path.join(projectPath, 'opencode.json')
    configPatcher.patchOpencodeJson(configPath, {
      mcp: {
        'context-mode': { type: 'local', command: ['context-mode'] },
      },
      plugin: ['context-mode'],
    })

    const agentsMd = configPatcher.findAgentsMd(projectPath)
    configPatcher.appendToAgentsMd(agentsMd, 'Context Mode', [
      'Context Mode is active for this project.',
      'Tool outputs are summarized before entering context, saving ~98% tokens.',
      '',
      'Status: /bcs-context-mode stats',
      'Doctor: /bcs-context-mode doctor',
    ].join('\n'))

    db.updateSetting('contextModeEnabled', '1')
    logger.info('Context Mode enabled', { projectPath })
  }

  disable(projectPath: string): void {
    const configPath = configPatcher.findOpencodeJson(projectPath)
    if (configPath) {
      configPatcher.removeFromOpencodeJson(configPath, [
        { key: 'plugin', value: 'context-mode' },
      ])

      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (config.mcp) {
          delete config.mcp['context-mode']
          if (Object.keys(config.mcp).length === 0) delete config.mcp
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      } catch {
        // ignore
      }
    }

    const agentsMd = path.join(projectPath, 'AGENTS.md')
    if (fs.existsSync(agentsMd)) {
      configPatcher.removeFromAgentsMd(agentsMd, 'Context Mode')
    }

    db.updateSetting('contextModeEnabled', '0')
    logger.info('Context Mode disabled', { projectPath })
  }

  toggle(projectPath: string): void {
    if (this.isActive(projectPath)) {
      this.disable(projectPath)
    } else {
      this.enable(projectPath)
    }
  }

  async getStats(): Promise<ContextModeStats> {
    try {
      const result = await runCommand('context-mode', ['statusline'], { timeout: 5000 })
      if (result.exitCode === 0) {
        const parsed = this.parseStatusLine(result.stdout)
        return {
          installed: true,
          active: true,
          ...parsed,
        }
      }
    } catch {
      // not installed or not running
    }

    return {
      installed: await this.isInstalled(),
      active: false,
      savedThisSession: '$0.00',
      savedTotal: '$0.00',
      efficiencyPercent: 0,
    }
  }

  private parseStatusLine(output: string): {
    savedThisSession: string
    savedTotal: string
    efficiencyPercent: number
  } {
    const savedMatch = output.match(/\$([\d.]+)\s*saved/i)
    const totalMatch = output.match(/\$([\d.]+)\s*total/i)
    const effMatch = output.match(/(\d+)%\s*efficient/i)

    return {
      savedThisSession: savedMatch ? `$${savedMatch[1]}` : '$0.00',
      savedTotal: totalMatch ? `$${totalMatch[1]}` : '$0.00',
      efficiencyPercent: effMatch ? parseInt(effMatch[1], 10) : 0,
    }
  }

  async runDoctor(): Promise<string> {
    try {
      const result = await runCommand('context-mode', ['doctor'], { timeout: 15000 })
      return result.stdout || result.stderr || 'Doctor completed.'
    } catch (err) {
      return `Doctor failed: ${err}`
    }
  }
}

export const contextModeService = new ContextModeService()
