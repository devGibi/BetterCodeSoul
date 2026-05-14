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

export interface GraphifyFullStatus {
  installed: boolean
  version: string | null
  active: boolean
  stats: GraphifyStats
  needsRebuild: boolean
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

  toggle(projectPath: string): void {
    if (this.isActive(projectPath)) {
      this.disable(projectPath)
    } else {
      this.enable(projectPath)
    }
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

  needsRebuild(projectPath: string): boolean {
    const graphPath = path.join(projectPath, 'graphify-out', 'graph.json')
    if (!fs.existsSync(graphPath)) return true

    try {
      const stat = fs.statSync(graphPath)
      const ageHours = (Date.now() - stat.mtimeMs) / 3600000
      return ageHours > 6
    } catch {
      return true
    }
  }

  async buildContextSummary(projectPath: string, userRequest: string): Promise<string | null> {
    if (!this.isActive(projectPath)) return null

    const graphPath = path.join(projectPath, 'graphify-out', 'graph.json')
    if (!fs.existsSync(graphPath)) return null

    try {
      const data = JSON.parse(fs.readFileSync(graphPath, 'utf-8'))
      const nodes = data.nodes || []

      const keywords = this.extractKeywords(userRequest)
      const relevantNodes = this.findRelevantNodes(nodes, keywords)

      if (relevantNodes.length === 0) return null

      return [
        '<!-- Graphify Baglam Ozeti (otomatik) -->',
        `Proje: ${path.basename(projectPath)}`,
        `Ilgili dosyalar (${relevantNodes.length} adet):`,
        ...relevantNodes.slice(0, 10).map((n: any) =>
          `- ${n.source_file || n.path || n.id}: ${n.summary || n.label || n.description || '(ozet yok)'}`
        ),
        relevantNodes.length > 10 ? `... ve ${relevantNodes.length - 10} dosya daha` : '',
        '<!-- /Graphify -->',
      ].filter(Boolean).join('\n')
    } catch {
      return null
    }
  }

  private extractKeywords(request: string): string[] {
    const stopWords = new Set(['ve', 'ile', 'icin', 'bir', 'bu', 'the', 'a', 'an', 'for', 'and', 'that', 'with', 'from'])
    return request
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
  }

  private findRelevantNodes(nodes: any[], keywords: string[]): any[] {
    return nodes
      .filter((n: any) => {
        const text = `${n.source_file || n.path || ''} ${n.summary || n.label || ''} ${(n.tags || []).join(' ')}`.toLowerCase()
        return keywords.some(kw => text.includes(kw))
      })
      .slice(0, 20)
  }

  async getFullStatus(projectPath: string): Promise<GraphifyFullStatus> {
    return {
      installed: await this.isInstalled(),
      version: await this.getVersion(),
      active: this.isActive(projectPath),
      stats: this.getStats(projectPath),
      needsRebuild: this.needsRebuild(projectPath),
    }
  }
}

export const graphifyService = new GraphifyService()
