import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { paths } from '../utils/platform.js'
import { logger } from '../utils/logger.js'

export class BcsDatabase {
  private db!: Database.Database

  async init(): Promise<void> {
    const dbPath = paths.hubDb()
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
    logger.info('Database initialized', { path: dbPath })
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        tool TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        model TEXT,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        model TEXT,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS session_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS orchestrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_request TEXT NOT NULL,
        agent_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        models_used TEXT,
        timestamp INTEGER NOT NULL,
        cancelled INTEGER DEFAULT 0,
        cancel_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_timestamp ON tool_calls(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_orchestrations_timestamp ON orchestrations(timestamp);
    `)

    this.db.exec(`
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('dailyLimit', '10.0'),
        ('autoApproveLimit', '0.10'),
        ('graphifyEnabled', '0'),
        ('contextModeEnabled', '0');
    `)
  }

  close(): void {
    if (this.db) {
      this.db.close()
    }
  }

  saveToolCall(call: {
    sessionId?: string
    tool: string
    inputTokens: number
    outputTokens: number
    cost: number
    model?: string
    timestamp: number
    durationMs?: number
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO tool_calls (session_id, tool, input_tokens, output_tokens, cost_usd, model, timestamp, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      call.sessionId || null,
      call.tool,
      call.inputTokens,
      call.outputTokens,
      call.cost,
      call.model || null,
      call.timestamp,
      call.durationMs || 0
    )
  }

  getToolCallsBySession(sessionId: string): Array<{
    id: number
    tool: string
    input_tokens: number
    output_tokens: number
    cost_usd: number
    model: string | null
    timestamp: number
  }> {
    return this.db.prepare('SELECT * FROM tool_calls WHERE session_id = ? ORDER BY timestamp').all(sessionId) as any[]
  }

  getToolCallsSince(timestamp: number): Array<{
    id: number
    session_id: string | null
    tool: string
    input_tokens: number
    output_tokens: number
    cost_usd: number
    model: string | null
    timestamp: number
  }> {
    return this.db.prepare('SELECT * FROM tool_calls WHERE timestamp >= ? ORDER BY timestamp').all(timestamp) as any[]
  }

  getTodayCost(): number {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const result = this.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM tool_calls WHERE timestamp >= ?').get(startOfDay.getTime()) as { total: number }
    return result.total
  }

  getCostByPeriod(startTimestamp: number): number {
    const result = this.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM tool_calls WHERE timestamp >= ?').get(startTimestamp) as { total: number }
    return result.total
  }

  getTokenStatsByPeriod(startTimestamp: number): {
    totalInput: number
    totalOutput: number
    totalCost: number
    toolCount: number
  } {
    const result = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as totalInput,
        COALESCE(SUM(output_tokens), 0) as totalOutput,
        COALESCE(SUM(cost_usd), 0) as totalCost,
        COUNT(*) as toolCount
      FROM tool_calls WHERE timestamp >= ?
    `).get(startTimestamp) as any
    return {
      totalInput: result.totalInput,
      totalOutput: result.totalOutput,
      totalCost: result.totalCost,
      toolCount: result.toolCount,
    }
  }

  getDailyStats(days: number): Array<{
    date: string
    tokens: number
    cost: number
    models: string[]
  }> {
    const start = Date.now() - days * 86_400_000
    const rows = this.db.prepare(`
      SELECT
        date(timestamp / 1000, 'unixepoch') as date,
        SUM(input_tokens + output_tokens) as tokens,
        SUM(cost_usd) as cost,
        GROUP_CONCAT(DISTINCT model) as models
      FROM tool_calls
      WHERE timestamp >= ?
      GROUP BY date
      ORDER BY date
    `).all(start) as any[]

    return rows.map((r) => ({
      date: r.date,
      tokens: r.tokens || 0,
      cost: r.cost || 0,
      models: r.models ? r.models.split(',').filter(Boolean) : [],
    }))
  }

  getSessionStats(): {
    thinkTierRatio: number
    reviewTierUsage: number
    avgContextFill: number
    avgSessionCost: number
    graphifyActive: boolean
    contextModeActive: boolean
    projectFileCount: number
    providerCount: number
  } {
    const last30Days = Date.now() - 30 * 86_400_000

    const modelCounts = this.db.prepare(`
      SELECT model, COUNT(*) as cnt FROM tool_calls
      WHERE timestamp >= ? AND model IS NOT NULL
      GROUP BY model
    `).all(last30Days) as Array<{ model: string; cnt: number }>

    const totalCalls = modelCounts.reduce((s, r) => s + r.cnt, 0)
    const thinkModels = ['claude-opus-4-5', 'o3', 'gemini-2.5-pro']
    const reviewModels = ['claude-haiku-4-5', 'gpt-4o-mini', 'minimax-text-01']

    const thinkCalls = modelCounts.filter((r) => thinkModels.includes(r.model)).reduce((s, r) => s + r.cnt, 0)
    const reviewCalls = modelCounts.filter((r) => reviewModels.includes(r.model)).reduce((s, r) => s + r.cnt, 0)
    const providers = new Set(modelCounts.map((r) => r.model.split('-')[0]))

    const sessionCosts = this.db.prepare(`
      SELECT SUM(cost_usd) as cost FROM tool_calls
      WHERE timestamp >= ? GROUP BY session_id
    `).all(last30Days) as Array<{ cost: number }>
    const avgSessionCost = sessionCosts.length > 0
      ? sessionCosts.reduce((s, r) => s + r.cost, 0) / sessionCosts.length
      : 0

    const graphifySetting = this.db.prepare("SELECT value FROM settings WHERE key = 'graphifyEnabled'").get() as { value: string } | undefined
    const ctxModeSetting = this.db.prepare("SELECT value FROM settings WHERE key = 'contextModeEnabled'").get() as { value: string } | undefined

    return {
      thinkTierRatio: totalCalls > 0 ? thinkCalls / totalCalls : 0,
      reviewTierUsage: reviewCalls,
      avgContextFill: 0.5,
      avgSessionCost,
      graphifyActive: graphifySetting?.value === '1',
      contextModeActive: ctxModeSetting?.value === '1',
      projectFileCount: 0,
      providerCount: providers.size,
    }
  }

  saveSessionSnapshot(sessionId: string, snapshot: string): void {
    this.db.prepare('INSERT INTO session_snapshots (session_id, snapshot, timestamp) VALUES (?, ?, ?)').run(
      sessionId,
      snapshot,
      Date.now()
    )
  }

  getLatestSnapshot(): { summary: string; timestamp: number } | null {
    const row = this.db.prepare('SELECT snapshot, timestamp FROM session_snapshots ORDER BY timestamp DESC LIMIT 1').get() as { snapshot: string; timestamp: number } | undefined
    return row ? { summary: row.snapshot, timestamp: row.timestamp } : null
  }

  saveOrchestration(data: {
    userRequest: string
    agentCount: number
    totalTokens: number
    totalCost: number
    durationMs: number
    modelsUsed: string[]
    cancelled?: boolean
    cancelReason?: string
  }): void {
    this.db.prepare(`
      INSERT INTO orchestrations (user_request, agent_count, total_tokens, total_cost_usd, duration_ms, models_used, timestamp, cancelled, cancel_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.userRequest,
      data.agentCount,
      data.totalTokens,
      data.totalCost,
      data.durationMs,
      data.modelsUsed.join(','),
      Date.now(),
      data.cancelled ? 1 : 0,
      data.cancelReason || null
    )
  }

  getOrchestrationCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as cnt FROM orchestrations').get() as { cnt: number }
    return result.cnt
  }

  updateSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  getSettings(): {
    dailyLimit: number
    autoApproveLimit: number
    graphifyEnabled: boolean
    contextModeEnabled: boolean
  } {
    return {
      dailyLimit: parseFloat(this.getSetting('dailyLimit') || '10.0'),
      autoApproveLimit: parseFloat(this.getSetting('autoApproveLimit') || '0.10'),
      graphifyActive: this.getSetting('graphifyEnabled') === '1',
      contextModeEnabled: this.getSetting('contextModeEnabled') === '1',
    } as any
  }
}

export const db = new BcsDatabase()
