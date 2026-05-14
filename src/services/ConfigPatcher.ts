import fs from 'node:fs'
import path from 'node:path'
import { paths } from '../utils/platform.js'
import { logger } from '../utils/logger.js'

export class ConfigPatcher {
  findOpencodeJson(projectPath: string): string | null {
    const candidates = [
      path.join(projectPath, 'opencode.json'),
      paths.opencodeConfig(),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    return null
  }

  patchOpencodeJson(filePath: string, patch: Record<string, unknown>): void {
    let config: Record<string, unknown> = {}

    if (fs.existsSync(filePath)) {
      try {
        const backupPath = filePath + '.bak'
        fs.copyFileSync(filePath, backupPath)
        config = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      } catch (err) {
        logger.warn('Failed to read existing opencode.json', err)
      }
    }

    const merged = this.deepMerge(config, patch)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8')
    logger.info('Patched opencode.json', { filePath })
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target }
    for (const key of Object.keys(source)) {
      if (
        key in result &&
        typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key]) &&
        typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>)
      } else if (Array.isArray(result[key]) && Array.isArray(source[key])) {
        const merged = new Set([...(result[key] as unknown[]), ...(source[key] as unknown[])])
        result[key] = [...merged]
      } else {
        result[key] = source[key]
      }
    }
    return result
  }

  removeFromOpencodeJson(filePath: string, pathsToRemove: Array<{ key: string; value?: unknown }>): void {
    if (!fs.existsSync(filePath)) return

    try {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      for (const { key, value } of pathsToRemove) {
        if (value !== undefined && Array.isArray(config[key])) {
          config[key] = config[key].filter((v: unknown) => v !== value)
          if (config[key].length === 0) delete config[key]
        } else {
          delete config[key]
        }
      }
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (err) {
      logger.warn('Failed to patch opencode.json', err)
    }
  }

  findAgentsMd(projectPath: string): string {
    const agentsPath = path.join(projectPath, 'AGENTS.md')
    if (!fs.existsSync(agentsPath)) {
      fs.writeFileSync(agentsPath, '# AGENTS\n\n', 'utf-8')
    }
    return agentsPath
  }

  appendToAgentsMd(filePath: string, section: string, content: string): void {
    let existing = ''
    if (fs.existsSync(filePath)) {
      existing = fs.readFileSync(filePath, 'utf-8')
    }

    const sectionHeader = `## ${section}`
    if (existing.includes(sectionHeader)) {
      const sectionRegex = new RegExp(`(${this.escapeRegex(sectionHeader)}[\\s\\S]*?)(?=## |$)`)
      const match = existing.match(sectionRegex)
      if (match) {
        if (!match[0].includes(content.trim())) {
          existing = existing.replace(match[0], match[0].trimEnd() + '\n\n' + content + '\n\n')
        }
      }
    } else {
      existing = existing.trimEnd() + '\n\n' + sectionHeader + '\n\n' + content + '\n\n'
    }

    fs.writeFileSync(filePath, existing, 'utf-8')
    logger.info('Updated AGENTS.md', { filePath, section })
  }

  removeFromAgentsMd(filePath: string, section: string): void {
    if (!fs.existsSync(filePath)) return

    let content = fs.readFileSync(filePath, 'utf-8')
    const sectionHeader = `## ${section}`
    const sectionRegex = new RegExp(`^${this.escapeRegex(sectionHeader)}[\\s\\S]*?(?=^## |$)`, 'gm')
    content = content.replace(sectionRegex, '')
    content = content.replace(/\n{3,}/g, '\n\n').trim() + '\n'

    fs.writeFileSync(filePath, content, 'utf-8')
    logger.info('Removed section from AGENTS.md', { section })
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

export const configPatcher = new ConfigPatcher()
