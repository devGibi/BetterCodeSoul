import fs from 'node:fs'
import path from 'node:path'
import { commandExists, runCommand, streamCommand } from '../utils/spawn.js'
import { configPatcher } from './ConfigPatcher.js'
import { db } from './Database.js'
import { logger } from '../utils/logger.js'

export interface GraphifyStats {
  installed: boolean
  version?: string
  nodeCount: number
  edgeCount: number
  fileCount: number
  sizeBytes: number
  lastBuilt: number | null
}

export class GraphifyService {
  async isInstalled(): Promise<boolean> {
    return commandExists('graphify')
  }

  isActive(projectPath: string): boolean {
    const agentsMd = path.join(projectPath, 'AGENTS.md')
    if (fs.existsSync(agentsMd)) {
      const content = fs.readFileSync(agentsMd, 'utf-8')
      if (content.includes('graphify')) return true
    }

    const graphJson = path.join(projectPath, 'graphify-out', 'graph.json')
    if (fs.existsSync(graphJson)) return true

    return false
  }

  async *install(): AsyncGenerator<string> {
    const pip = process.platform === 'win32' ? 'pip' : 'pip3'
    yield 'Installing graphify...'

    for await (const line of streamCommand(pip, ['install', 'graphifyy', '--break-system-packages'])) {
      yield line
    }

    const installed = await this.isInstalled()
    if (installed) {
      yield 'Graphify installed successfully.'
      yield 'Running: graphify install --platform opencode'
      try {
        const result = await runCommand('graphify', ['install', '--platform', 'opencode'])
        if (result.stdout) yield result.stdout
        if (result.stderr) yield result.stderr
      } catch (err) {
        yield `Warning: platform install failed: ${err}`
      }
    } else {
      yield 'ERROR: graphify installation failed.'
    }
  }

  async *build(projectPath: string): AsyncGenerator<string> {
    yield `Building graph in ${projectPath}...`

    for await (const line of streamCommand('graphify', ['.'], { cwd: projectPath })) {
      yield line
    }

    const graphPath = path.join(projectPath, 'graphify-out', 'graph.json')
    if (fs.existsSync(graphPath)) {
      const stats = this.getStats(projectPath)
      yield `Graph built: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, ${stats.fileCount} files`
    }
  }

  enable(projectPath: string): void {
    const agentsMd = configPatcher.findAgentsMd(projectPath)
    configPatcher.appendToAgentsMd(agentsMd, 'Graphify', [
      'This project uses Graphify for knowledge graph analysis.',
      'Use /bcs-graphify to manage the graph.',
      '',
      '```',
      'graphify .',
      'graphify query "<question>"',
      '```',
    ].join('\n'))

    db.updateSetting('graphifyEnabled', '1')
    logger.info('Graphify enabled', { projectPath })
  }

  disable(projectPath: string): void {
    const agentsMd = path.join(projectPath, 'AGENTS.md')
    if (fs.existsSync(agentsMd)) {
      configPatcher.removeFromAgentsMd(agentsMd, 'Graphify')
    }
    db.updateSetting('graphifyEnabled', '0')
    logger.info('Graphify disabled', { projectPath })
  }

  getStats(projectPath: string): GraphifyStats {
    const graphPath = path.join(projectPath, 'graphify-out', 'graph.json')
    if (!fs.existsSync(graphPath)) {
      return { installed: false, nodeCount: 0, edgeCount: 0, fileCount: 0, sizeBytes: 0, lastBuilt: null }
    }

    try {
      const stat = fs.statSync(graphPath)
      const data = JSON.parse(fs.readFileSync(graphPath, 'utf-8'))
      const nodes = data.nodes || []
      const links = data.links || data.edges || []

      const files = new Set<string>()
      for (const node of nodes) {
        if (node.source_file) files.add(node.source_file)
      }

      return {
        installed: true,
        nodeCount: nodes.length,
        edgeCount: links.length,
        fileCount: files.size || nodes.length,
        sizeBytes: stat.size,
        lastBuilt: stat.mtimeMs,
      }
    } catch {
      return { installed: true, nodeCount: 0, edgeCount: 0, fileCount: 0, sizeBytes: 0, lastBuilt: null }
    }
  }

  async getVersion(): Promise<string | null> {
    try {
      const result = await runCommand('graphify', ['--version'])
      return result.stdout.trim() || null
    } catch {
      return null
    }
  }
}

export const graphifyService = new GraphifyService()
