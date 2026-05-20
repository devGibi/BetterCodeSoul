import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { paths, type BcsDataScope } from '../utils/platform.js'
import { logger } from '../utils/logger.js'

export class BcsDatabase {
  private db!: Database.Database
  private dbPath: string | null = null
  private ready = false

  async init(options: { projectPath?: string; scope?: BcsDataScope; dbPath?: string } = {}): Promise<void> {
    const dbPath = options.dbPath || paths.activeDb(options.projectPath || process.cwd(), options.scope || 'auto')
    if (this.ready && this.dbPath === dbPath) return
    if (this.ready) this.close()

    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.dbPath = dbPath
    this.ready = true
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

      CREATE TABLE IF NOT EXISTS decompose_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        user_request TEXT NOT NULL,
        task_type TEXT,
        complexity TEXT,
        planner_model TEXT,
        coder_models TEXT,
        reviewer_model TEXT,
        context_files TEXT,
        estimated_tokens INTEGER,
        estimated_cost REAL,
        estimated_minutes INTEGER,
        reasoning TEXT,
        warnings TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS orchestration_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orchestration_id INTEGER REFERENCES orchestrations(id),
        step_index INTEGER,
        role TEXT,
        model TEXT,
        task TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost REAL,
        duration_ms INTEGER,
        success INTEGER,
        error TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS routing_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        tier TEXT,
        selected_model TEXT,
        reason TEXT,
        connected_models TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS quality_checkpoints (
        id TEXT PRIMARY KEY,
        orchestration_id INTEGER REFERENCES orchestrations(id),
        label TEXT,
        strategy TEXT,
        patch_path TEXT,
        status TEXT,
        safe_to_rollback INTEGER DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quality_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orchestration_id INTEGER REFERENCES orchestrations(id),
        success_score REAL DEFAULT 0,
        passed INTEGER DEFAULT 0,
        successful_tasks INTEGER DEFAULT 0,
        failed_tasks INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        rollback_recommended INTEGER DEFAULT 0,
        rollback_performed INTEGER DEFAULT 0,
        checkpoint_id TEXT REFERENCES quality_checkpoints(id),
        total_cost_usd REAL DEFAULT 0,
        cost_per_successful_task REAL DEFAULT 0,
        diff_summary TEXT,
        summary TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quality_command_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quality_run_id INTEGER REFERENCES quality_runs(id),
        kind TEXT,
        label TEXT,
        command_display TEXT,
        exit_code INTEGER,
        duration_ms INTEGER,
        success INTEGER,
        stdout_tail TEXT,
        stderr_tail TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS router_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orchestration_id INTEGER REFERENCES orchestrations(id),
        repo_key TEXT,
        task_type TEXT,
        complexity TEXT,
        tier TEXT NOT NULL,
        role TEXT,
        selected_model TEXT NOT NULL,
        strategy TEXT,
        reason TEXT,
        candidates TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS router_model_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orchestration_id INTEGER REFERENCES orchestrations(id),
        quality_run_id INTEGER REFERENCES quality_runs(id),
        repo_key TEXT,
        task_type TEXT,
        complexity TEXT,
        tier TEXT NOT NULL,
        role TEXT,
        model TEXT NOT NULL,
        step_success INTEGER DEFAULT 0,
        quality_passed INTEGER DEFAULT 0,
        success_score REAL DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_timestamp ON tool_calls(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_orchestrations_timestamp ON orchestrations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_decompose_decisions_session ON decompose_decisions(session_id);
      CREATE INDEX IF NOT EXISTS idx_orchestration_steps_orch ON orchestration_steps(orchestration_id);
      CREATE INDEX IF NOT EXISTS idx_routing_log_session ON routing_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_quality_runs_orch ON quality_runs(orchestration_id);
      CREATE INDEX IF NOT EXISTS idx_quality_runs_created ON quality_runs(created_at);
      CREATE INDEX IF NOT EXISTS idx_quality_command_runs_quality ON quality_command_runs(quality_run_id);
      CREATE INDEX IF NOT EXISTS idx_router_decisions_repo ON router_decisions(repo_key, task_type, tier, created_at);
      CREATE INDEX IF NOT EXISTS idx_router_outcomes_repo ON router_model_outcomes(repo_key, task_type, tier, created_at);
      CREATE INDEX IF NOT EXISTS idx_router_outcomes_model ON router_model_outcomes(model, tier, created_at);
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
    if (this.ready && this.db) {
      this.db.close()
      this.ready = false
      this.dbPath = null
    }
  }

  getPath(): string | null {
    return this.dbPath
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

  getUsageHistory(days: number): Array<{
    date: string
    tokens: number
    cost: number
    models: string[]
  }> {
    return this.getDailyStats(days)
  }

  getTodayStats(): {
    totalTokens: number
    totalCost: number
    toolCount: number
  } {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const stats = this.getTokenStatsByPeriod(startOfDay.getTime())
    return {
      totalTokens: stats.totalInput + stats.totalOutput,
      totalCost: stats.totalCost,
      toolCount: stats.toolCount,
    }
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

  getOptimizationStats(): {
    thinkTierRatio: number
    reviewTierUsage: number
    avgContextFill: number
    avgSessionCost: number
    graphifyActive: boolean
    contextModeActive: boolean
    projectFileCount: number
    providerCount: number
  } {
    return this.getSessionStats()
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
  }): number {
    const result = this.db.prepare(`
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
    return Number(result.lastInsertRowid)
  }

  updateOrchestration(id: number, data: {
    agentCount: number
    totalTokens: number
    totalCost: number
    durationMs: number
    modelsUsed: string[]
    cancelled?: boolean
    cancelReason?: string
  }): void {
    this.db.prepare(`
      UPDATE orchestrations
      SET agent_count = ?, total_tokens = ?, total_cost_usd = ?, duration_ms = ?, models_used = ?, cancelled = ?, cancel_reason = ?
      WHERE id = ?
    `).run(
      data.agentCount,
      data.totalTokens,
      data.totalCost,
      data.durationMs,
      data.modelsUsed.join(','),
      data.cancelled ? 1 : 0,
      data.cancelReason || null,
      id
    )
  }

  getOrchestrationCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as cnt FROM orchestrations').get() as { cnt: number }
    return result.cnt
  }

  getLastOrchestration(): {
    id: number
    userRequest: string
    agentCount: number
    totalTokens: number
    totalCost: number
    durationMs: number
    modelsUsed: string
    timestamp: number
    cancelled: number
    cancelReason: string | null
    quality?: any
    steps: Array<{
      step_index: number
      role: string
      model: string
      task: string
      input_tokens: number
      output_tokens: number
      cost: number
      duration_ms: number
      success: number
      error: string | null
    }>
  } | null {
    const orch = this.db.prepare('SELECT * FROM orchestrations ORDER BY timestamp DESC LIMIT 1').get() as any
    if (!orch) return null

    const steps = this.db.prepare(
      'SELECT step_index, role, model, task, input_tokens, output_tokens, cost, duration_ms, success, error FROM orchestration_steps WHERE orchestration_id = ? ORDER BY step_index'
    ).all(orch.id) as any[]

    const quality = this.getLastQualityRun(orch.id)

    return { ...orch, steps, quality }
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

  saveDecomposeDecision(data: {
    sessionId?: string
    userRequest: string
    taskType: string
    complexity: string
    plannerModel: string | null
    coderModels: string
    reviewerModel: string | null
    contextFiles: string
    estimatedTokens: number
    estimatedCost: number
    estimatedMinutes: number
    reasoning: string
    warnings: string
  }): void {
    this.db.prepare(`
      INSERT INTO decompose_decisions (session_id, user_request, task_type, complexity, planner_model, coder_models, reviewer_model, context_files, estimated_tokens, estimated_cost, estimated_minutes, reasoning, warnings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.sessionId || null,
      data.userRequest,
      data.taskType,
      data.complexity,
      data.plannerModel,
      data.coderModels,
      data.reviewerModel,
      data.contextFiles,
      data.estimatedTokens,
      data.estimatedCost,
      data.estimatedMinutes,
      data.reasoning,
      data.warnings
    )
  }

  getLastDecomposeDecision(): {
    user_request: string
    task_type: string
    complexity: string
    planner_model: string | null
    coder_models: string
    reviewer_model: string | null
    context_files: string
    estimated_tokens: number
    estimated_cost: number
    estimated_minutes: number
    reasoning: string
    warnings: string
    created_at: number
  } | null {
    const row = this.db.prepare('SELECT * FROM decompose_decisions ORDER BY created_at DESC LIMIT 1').get() as any
    return row || null
  }

  saveOrchestrationStep(data: {
    orchestrationId: number
    stepIndex: number
    role: string
    model: string
    task: string
    inputTokens: number
    outputTokens: number
    cost: number
    durationMs: number
    success: boolean
    error?: string
  }): void {
    this.db.prepare(`
      INSERT INTO orchestration_steps (orchestration_id, step_index, role, model, task, input_tokens, output_tokens, cost, duration_ms, success, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.orchestrationId,
      data.stepIndex,
      data.role,
      data.model,
      data.task,
      data.inputTokens,
      data.outputTokens,
      data.cost,
      data.durationMs,
      data.success ? 1 : 0,
      data.error || null
    )
  }

  saveRoutingLog(data: {
    sessionId?: string
    tier: string
    selectedModel: string
    reason: string
    connectedModels: string[]
    timestamp: number
  }): void {
    this.db.prepare(`
      INSERT INTO routing_log (session_id, tier, selected_model, reason, connected_models, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.sessionId || null,
      data.tier,
      data.selectedModel,
      data.reason,
      JSON.stringify(data.connectedModels),
      data.timestamp
    )
  }

  saveRouterDecision(data: {
    orchestrationId?: number
    repoKey?: string
    taskType?: string
    complexity?: string
    tier: string
    role?: string
    selectedModel: string
    strategy: string
    reason: string
    candidates: unknown
  }): number {
    const result = this.db.prepare(`
      INSERT INTO router_decisions (orchestration_id, repo_key, task_type, complexity, tier, role, selected_model, strategy, reason, candidates, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.orchestrationId || null,
      data.repoKey || null,
      data.taskType || null,
      data.complexity || null,
      data.tier,
      data.role || null,
      data.selectedModel,
      data.strategy,
      data.reason,
      JSON.stringify(data.candidates),
      Date.now()
    )
    return Number(result.lastInsertRowid)
  }

  saveRouterModelOutcomes(outcomes: Array<{
    orchestrationId: number
    qualityRunId: number
    repoKey: string
    taskType: string
    complexity: string
    tier: string
    role: string
    model: string
    stepSuccess: boolean
    qualityPassed: boolean
    successScore: number
    cost: number
    durationMs: number
    inputTokens: number
    outputTokens: number
    retryCount: number
  }>): void {
    if (outcomes.length === 0) return
    const stmt = this.db.prepare(`
      INSERT INTO router_model_outcomes (orchestration_id, quality_run_id, repo_key, task_type, complexity, tier, role, model, step_success, quality_passed, success_score, cost_usd, duration_ms, input_tokens, output_tokens, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction((rows: typeof outcomes) => {
      for (const row of rows) {
        stmt.run(
          row.orchestrationId,
          row.qualityRunId,
          row.repoKey,
          row.taskType,
          row.complexity,
          row.tier,
          row.role,
          row.model,
          row.stepSuccess ? 1 : 0,
          row.qualityPassed ? 1 : 0,
          row.successScore,
          row.cost,
          row.durationMs,
          row.inputTokens,
          row.outputTokens,
          row.retryCount,
          Date.now()
        )
      }
    })
    tx(outcomes)
  }

  saveQualityCheckpoint(data: {
    id: string
    orchestrationId: number
    label: string
    strategy: string
    patchPath?: string
    status: string
    safeToRollback: boolean
    error?: string
    createdAt: number
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO quality_checkpoints (id, orchestration_id, label, strategy, patch_path, status, safe_to_rollback, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.orchestrationId,
      data.label,
      data.strategy,
      data.patchPath || null,
      data.status,
      data.safeToRollback ? 1 : 0,
      data.error || null,
      data.createdAt
    )
  }

  saveQualityRun(data: {
    orchestrationId: number
    successScore: number
    passed: boolean
    successfulTasks: number
    failedTasks: number
    retryCount: number
    rollbackRecommended: boolean
    rollbackPerformed?: boolean
    checkpointId?: string
    totalCost: number
    costPerSuccessfulTask: number
    diffSummary: unknown
    summary: string
    commands: Array<{
      kind: string
      label: string
      display: string
      exitCode: number
      durationMs: number
      success: boolean
      stdout: string
      stderr: string
    }>
  }): number {
    const result = this.db.prepare(`
      INSERT INTO quality_runs (orchestration_id, success_score, passed, successful_tasks, failed_tasks, retry_count, rollback_recommended, rollback_performed, checkpoint_id, total_cost_usd, cost_per_successful_task, diff_summary, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.orchestrationId,
      data.successScore,
      data.passed ? 1 : 0,
      data.successfulTasks,
      data.failedTasks,
      data.retryCount,
      data.rollbackRecommended ? 1 : 0,
      data.rollbackPerformed ? 1 : 0,
      data.checkpointId || null,
      data.totalCost,
      data.costPerSuccessfulTask,
      JSON.stringify(data.diffSummary),
      data.summary,
      Date.now()
    )
    const qualityRunId = Number(result.lastInsertRowid)
    const stmt = this.db.prepare(`
      INSERT INTO quality_command_runs (quality_run_id, kind, label, command_display, exit_code, duration_ms, success, stdout_tail, stderr_tail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const command of data.commands) {
      stmt.run(
        qualityRunId,
        command.kind,
        command.label,
        command.display,
        command.exitCode,
        command.durationMs,
        command.success ? 1 : 0,
        command.stdout,
        command.stderr
      )
    }
    return qualityRunId
  }

  getLastQualityRun(orchestrationId?: number): any | null {
    const row = orchestrationId
      ? this.db.prepare('SELECT * FROM quality_runs WHERE orchestration_id = ? ORDER BY created_at DESC LIMIT 1').get(orchestrationId) as any
      : this.db.prepare('SELECT * FROM quality_runs ORDER BY created_at DESC LIMIT 1').get() as any
    if (!row) return null

    const commands = this.db.prepare('SELECT kind, label, command_display, exit_code, duration_ms, success, stdout_tail, stderr_tail FROM quality_command_runs WHERE quality_run_id = ? ORDER BY id').all(row.id) as any[]
    return {
      ...row,
      passed: Boolean(row.passed),
      rollback_recommended: Boolean(row.rollback_recommended),
      rollback_performed: Boolean(row.rollback_performed),
      diff_summary: parseJson(row.diff_summary, null),
      commands: commands.map((command) => ({ ...command, success: Boolean(command.success) })),
    }
  }

  getQualitySummary(days: number): {
    totalRuns: number
    successfulRuns: number
    avgSuccessScore: number
    successRate: number
    avgCostPerSuccessfulTask: number
    retryRate: number
    conflictRate: number
  } {
    const start = Date.now() - days * 86_400_000
    const rows = this.db.prepare('SELECT success_score, passed, cost_per_successful_task, retry_count, diff_summary FROM quality_runs WHERE created_at >= ?').all(start) as any[]
    const totalRuns = rows.length
    if (totalRuns === 0) {
      return { totalRuns: 0, successfulRuns: 0, avgSuccessScore: 0, successRate: 0, avgCostPerSuccessfulTask: 0, retryRate: 0, conflictRate: 0 }
    }

    const successfulRuns = rows.filter((row) => row.passed).length
    const conflictRuns = rows.filter((row) => (parseJson(row.diff_summary, {})?.conflictCount || 0) > 0).length
    return {
      totalRuns,
      successfulRuns,
      avgSuccessScore: rows.reduce((sum, row) => sum + (row.success_score || 0), 0) / totalRuns,
      successRate: successfulRuns / totalRuns,
      avgCostPerSuccessfulTask: rows.reduce((sum, row) => sum + (row.cost_per_successful_task || 0), 0) / totalRuns,
      retryRate: rows.filter((row) => (row.retry_count || 0) > 0).length / totalRuns,
      conflictRate: conflictRuns / totalRuns,
    }
  }

  getModelPerformanceHistory(days: number): Array<{
    model: string
    role: string
    runs: number
    successRate: number
    avgDurationMs: number
    avgCost: number
    avgTokens: number
  }> {
    const start = Date.now() - days * 86_400_000
    const rows = this.db.prepare(`
      SELECT
        model,
        role,
        COUNT(*) as runs,
        AVG(success) as successRate,
        AVG(duration_ms) as avgDurationMs,
        AVG(cost) as avgCost,
        AVG(input_tokens + output_tokens) as avgTokens
      FROM orchestration_steps
      WHERE created_at >= ? AND model IS NOT NULL
      GROUP BY model, role
      ORDER BY runs DESC, successRate DESC
    `).all(start) as any[]

    return rows.map((row) => ({
      model: row.model,
      role: row.role,
      runs: row.runs || 0,
      successRate: row.successRate || 0,
      avgDurationMs: row.avgDurationMs || 0,
      avgCost: row.avgCost || 0,
      avgTokens: row.avgTokens || 0,
    }))
  }

  getRouterModelStats(input: {
    days: number
    tier?: string
    repoKey?: string
    taskType?: string
    complexity?: string
  }): Array<{
    model: string
    tier: string
    role: string
    runs: number
    qualityPassRate: number
    stepSuccessRate: number
    avgSuccessScore: number
    avgCost: number
    avgDurationMs: number
    avgTokens: number
    retryRate: number
  }> {
    const start = Date.now() - input.days * 86_400_000
    const where = ['created_at >= ?']
    const params: unknown[] = [start]

    if (input.tier) {
      where.push('tier = ?')
      params.push(input.tier)
    }
    if (input.repoKey) {
      where.push('repo_key = ?')
      params.push(input.repoKey)
    }
    if (input.taskType) {
      where.push('task_type = ?')
      params.push(input.taskType)
    }
    if (input.complexity) {
      where.push('complexity = ?')
      params.push(input.complexity)
    }

    const rows = this.db.prepare(`
      SELECT
        model,
        tier,
        role,
        COUNT(*) as runs,
        AVG(quality_passed) as qualityPassRate,
        AVG(step_success) as stepSuccessRate,
        AVG(success_score) as avgSuccessScore,
        AVG(cost_usd) as avgCost,
        AVG(duration_ms) as avgDurationMs,
        AVG(input_tokens + output_tokens) as avgTokens,
        AVG(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as retryRate
      FROM router_model_outcomes
      WHERE ${where.join(' AND ')}
      GROUP BY model, tier, role
      ORDER BY runs DESC, qualityPassRate DESC, avgSuccessScore DESC
    `).all(...params) as any[]

    return rows.map((row) => ({
      model: row.model,
      tier: row.tier,
      role: row.role,
      runs: row.runs || 0,
      qualityPassRate: row.qualityPassRate || 0,
      stepSuccessRate: row.stepSuccessRate || 0,
      avgSuccessScore: row.avgSuccessScore || 0,
      avgCost: row.avgCost || 0,
      avgDurationMs: row.avgDurationMs || 0,
      avgTokens: row.avgTokens || 0,
      retryRate: row.retryRate || 0,
    }))
  }

  getRouterRecommendations(days: number, repoKey?: string, limit = 20): Array<{
    model: string
    tier: string
    runs: number
    qualityPassRate: number
    stepSuccessRate: number
    avgSuccessScore: number
    avgCost: number
    avgDurationMs: number
    retryRate: number
  }> {
    const start = Date.now() - days * 86_400_000
    const where = ['created_at >= ?']
    const params: unknown[] = [start]
    if (repoKey) {
      where.push('repo_key = ?')
      params.push(repoKey)
    }
    params.push(limit)

    const rows = this.db.prepare(`
      SELECT
        model,
        tier,
        COUNT(*) as runs,
        AVG(quality_passed) as qualityPassRate,
        AVG(step_success) as stepSuccessRate,
        AVG(success_score) as avgSuccessScore,
        AVG(cost_usd) as avgCost,
        AVG(duration_ms) as avgDurationMs,
        AVG(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as retryRate
      FROM router_model_outcomes
      WHERE ${where.join(' AND ')}
      GROUP BY model, tier
      ORDER BY qualityPassRate DESC, avgSuccessScore DESC, runs DESC
      LIMIT ?
    `).all(...params) as any[]

    return rows.map((row) => ({
      model: row.model,
      tier: row.tier,
      runs: row.runs || 0,
      qualityPassRate: row.qualityPassRate || 0,
      stepSuccessRate: row.stepSuccessRate || 0,
      avgSuccessScore: row.avgSuccessScore || 0,
      avgCost: row.avgCost || 0,
      avgDurationMs: row.avgDurationMs || 0,
      retryRate: row.retryRate || 0,
    }))
  }

  getRouterSummary(days: number, repoKey?: string): {
    decisions: number
    outcomes: number
    avgSuccessScore: number
    qualityPassRate: number
    escalationCount: number
    autoReviewerCount: number
  } {
    const start = Date.now() - days * 86_400_000
    const decisionWhere = ['created_at >= ?']
    const outcomeWhere = ['created_at >= ?']
    const decisionParams: unknown[] = [start]
    const outcomeParams: unknown[] = [start]
    if (repoKey) {
      decisionWhere.push('repo_key = ?')
      outcomeWhere.push('repo_key = ?')
      decisionParams.push(repoKey)
      outcomeParams.push(repoKey)
    }

    const decisionRow = this.db.prepare(`
      SELECT
        COUNT(*) as decisions,
        SUM(CASE WHEN strategy LIKE '%escalat%' THEN 1 ELSE 0 END) as escalationCount,
        SUM(CASE WHEN strategy LIKE '%auto-review%' THEN 1 ELSE 0 END) as autoReviewerCount
      FROM router_decisions
      WHERE ${decisionWhere.join(' AND ')}
    `).get(...decisionParams) as any

    const outcomeRow = this.db.prepare(`
      SELECT COUNT(*) as outcomes, AVG(success_score) as avgSuccessScore, AVG(quality_passed) as qualityPassRate
      FROM router_model_outcomes
      WHERE ${outcomeWhere.join(' AND ')}
    `).get(...outcomeParams) as any

    return {
      decisions: decisionRow?.decisions || 0,
      outcomes: outcomeRow?.outcomes || 0,
      avgSuccessScore: outcomeRow?.avgSuccessScore || 0,
      qualityPassRate: outcomeRow?.qualityPassRate || 0,
      escalationCount: decisionRow?.escalationCount || 0,
      autoReviewerCount: decisionRow?.autoReviewerCount || 0,
    }
  }

  getRecentQualityRuns(limit: number): any[] {
    const rows = this.db.prepare(`
      SELECT qr.*, o.user_request, o.timestamp
      FROM quality_runs qr
      LEFT JOIN orchestrations o ON o.id = qr.orchestration_id
      ORDER BY qr.created_at DESC
      LIMIT ?
    `).all(limit) as any[]
    return rows.map((row) => ({
      ...row,
      passed: Boolean(row.passed),
      rollback_recommended: Boolean(row.rollback_recommended),
      diff_summary: parseJson(row.diff_summary, null),
    }))
  }
}

function parseJson(value: string | null | undefined, fallback: any): any {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export const db = new BcsDatabase()
