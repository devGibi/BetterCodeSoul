import fs from 'node:fs'
import path from 'node:path'
import { db } from '../services/Database.js'
import type { Model, ModelTier } from '../services/ModelRegistry.js'
import { modelRegistry } from '../services/ModelRegistry.js'
import { graphifyService } from '../services/GraphifyService.js'

export type TaskType = 'feature' | 'fix' | 'refactor' | 'review' | 'research' | 'unknown'

export interface DecomposeContext {
  projectPath: string
  contextFiles: string[]
  availableModels: string[]
}

export interface DecomposeDecision {
  taskType: TaskType
  complexity: 'simple' | 'medium' | 'complex'
  reasoning: string[]
  plannerModel: { id: string; reason: string } | null
  coderModels: Array<{ id: string; reason: string; task: string }>
  reviewerModel: { id: string; reason: string } | null
  contextFiles: Array<{ path: string; reason: string }>
  estimatedTokens: number
  estimatedCost: number
  estimatedMinutes: number
  warnings: string[]
}

export interface CoderTask {
  id: string
  task: string
  directory: string
  files: string[]
}

export interface TaskPlan {
  strategy: 'plan-code-review' | 'parallel-code' | 'sequential'
  plannerTask: string
  coderTasks: CoderTask[]
  reviewTask: string
  estimatedCost: number
  estimatedMinutes: number
}

const TASK_PATTERNS: Record<TaskType, RegExp> = {
  feature: /ekle|implement|yaz|olustur|create|add|build/i,
  fix: /duzelt|fix|hata|bug|broken|calismiyor/i,
  refactor: /refactor|temizle|yeniden yaz|clean|reorganize/i,
  review: /incele|review|kontrol|check|analiz/i,
  research: /arastir|nedir|nasil|ne zaman|research|explain/i,
  unknown: /.*/,
}

const DIR_HINTS: Record<string, string[]> = {
  'component|ui|ekran|sayfa': ['src/components/', 'src/pages/'],
  'api|endpoint|route': ['src/api/', 'src/routes/', 'src/handlers/'],
  'db|database|migration|tablo': ['migrations/', 'src/db/', 'prisma/'],
  'test|spec': ['tests/', '__tests__/', 'src/__tests__/'],
  'auth|login|jwt': ['src/auth/', 'src/middleware/'],
  'style|css|tailwind': ['src/styles/', 'src/components/'],
}

export class TaskDecomposer {
  private matchedKeyword: string = ''

  detectTaskType(request: string): TaskType {
    for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
      if (type === 'unknown') continue
      const match = request.match(pattern)
      if (match) {
        this.matchedKeyword = match[0]
        return type as TaskType
      }
    }
    this.matchedKeyword = ''
    return 'unknown'
  }

  private detectComplexity(request: string, ctx: DecomposeContext): 'simple' | 'medium' | 'complex' {
    const simplePatterns = /duzelt|fix|rename|yeniden adlandir|sil|kaldir|comment|yorum/i
    if (simplePatterns.test(request)) return 'simple'

    const complexPatterns = /refactor|migration|auth|authentication|payment|odeme|buyuk|tum|sistem|buyuk/i
    if (complexPatterns.test(request)) return 'complex'

    return 'medium'
  }

  private complexityReason(request: string, complexity: string): string {
    if (complexity === 'simple') return 'tek dosya/kucuk degisiklik'
    if (complexity === 'complex') return 'coklu sistem/migration/refactor'
    return 'standart ozellik gelistirme'
  }

  private async selectContextFiles(request: string, taskType: TaskType, ctx: DecomposeContext): Promise<Array<{ path: string; reason: string }>> {
    const files: Array<{ path: string; reason: string }> = []

    if (await this.fileExists(ctx.projectPath, 'RULES.md')) {
      files.push({ path: 'RULES.md', reason: 'Kod kurallari — her zaman dahil' })
    }
    if (await this.fileExists(ctx.projectPath, 'PROGRESS.md')) {
      files.push({ path: 'PROGRESS.md', reason: 'Proje durumu — hangi kisimlar bitti' })
    }

    if (['feature', 'fix', 'refactor'].includes(taskType)) {
      if (await this.fileExists(ctx.projectPath, 'SPEC.md')) {
        files.push({ path: 'SPEC.md', reason: 'Proje tanimi — feature scope icin gerekli' })
      }
    }

    if (taskType === 'research') {
      if (await this.fileExists(ctx.projectPath, 'DECISIONS.md')) {
        files.push({ path: 'DECISIONS.md', reason: 'Mimari kararlar — arastirma baglami' })
      }
    }

    if (graphifyService.isActive(ctx.projectPath)) {
      files.push({
        path: 'graphify-out/context.md',
        reason: 'Graphify bilgi grafigi — tum proje yapisini ozetler',
      })
    }

    return files
  }

  private async fileExists(projectPath: string, file: string): Promise<boolean> {
    try {
      return fs.existsSync(path.join(projectPath, file))
    } catch {
      return false
    }
  }

  private selectModel(tier: ModelTier, connected: string[]): { id: string; reason: string } {
    const connectedModels = modelRegistry.getConnectedModels().filter(m => m.tier === tier)
    if (connectedModels.length > 0) {
      const cheapest = connectedModels.sort((a, b) => a.inputPrice - b.inputPrice)[0]
      return {
        id: cheapest.id,
        reason: `En ucuz bagli ${tier.toUpperCase()} tier modeli ($${cheapest.inputPrice}/1M giris)`,
      }
    }

    const catalogModels = modelRegistry.getModelsByTier(tier)
    if (catalogModels.length > 0) {
      const cheapest = catalogModels.sort((a, b) => a.inputPrice - b.inputPrice)[0]
      return {
        id: cheapest.id,
        reason: `Katalog fallback — ${tier.toUpperCase()} tier ($${cheapest.inputPrice}/1M giris) [BAGLI DEGIL]`,
      }
    }

    return {
      id: 'unknown',
      reason: `${tier.toUpperCase()} tier icin model bulunamadi`,
    }
  }

  private estimateSubtasks(request: string): number {
    const subtaskIndicators = /ve|ile|ayrica|also|and|plus|then|sonra/gi
    const matches = request.match(subtaskIndicators)
    return Math.min(4, 1 + (matches?.length || 0))
  }

  private estimateTokens(decision: DecomposeDecision): number {
    const AVG_TOKENS = {
      plan: { input: 3000, output: 2000 },
      code: { input: 4000, output: 2000 },
      review: { input: 2000, output: 800 },
    }

    let total = 0
    if (decision.plannerModel) {
      total += AVG_TOKENS.plan.input + AVG_TOKENS.plan.output
    }
    total += decision.coderModels.length * (AVG_TOKENS.code.input + AVG_TOKENS.code.output)
    if (decision.reviewerModel) {
      total += decision.coderModels.length * (AVG_TOKENS.review.input + AVG_TOKENS.review.output)
    }
    return total
  }

  private estimateCost(decision: DecomposeDecision): number {
    const prices: Record<string, { input: number; output: number }> = {}
    for (const m of modelRegistry.getAllModels()) {
      prices[m.id] = { input: m.inputPrice, output: m.outputPrice }
    }

    const AVG_TOKENS = {
      plan: { input: 3000, output: 2000 },
      code: { input: 4000, output: 2000 },
      review: { input: 2000, output: 800 },
    }

    let total = 0
    if (decision.plannerModel) {
      const p = prices[decision.plannerModel.id] || { input: 1.25, output: 10 }
      total += (AVG_TOKENS.plan.input / 1e6) * p.input + (AVG_TOKENS.plan.output / 1e6) * p.output
    }
    for (const coder of decision.coderModels) {
      const p = prices[coder.id] || { input: 0.6, output: 2.5 }
      total += (AVG_TOKENS.code.input / 1e6) * p.input + (AVG_TOKENS.code.output / 1e6) * p.output
    }
    if (decision.reviewerModel) {
      const p = prices[decision.reviewerModel.id] || { input: 0.8, output: 4 }
      total += decision.coderModels.length * ((AVG_TOKENS.review.input / 1e6) * p.input + (AVG_TOKENS.review.output / 1e6) * p.output)
    }

    return total
  }

  private estimateMinutes(complexity: string, coderCount: number): number {
    if (complexity === 'simple') return 2
    if (complexity === 'complex') return 2 + 3 + 1 + Math.min(coderCount, 2)
    return 2 + 3 + 1
  }

  async decompose(request: string, ctx: DecomposeContext): Promise<DecomposeDecision> {
    const reasoning: string[] = []
    const warnings: string[] = []

    const taskType = this.detectTaskType(request)
    reasoning.push(`Gorev tipi: ${taskType}${this.matchedKeyword ? ` (anahtar kelime: "${this.matchedKeyword}")` : ''}`)

    const complexity = this.detectComplexity(request, ctx)
    reasoning.push(`Karmasiklik: ${complexity} (${this.complexityReason(request, complexity)})`)

    const connected = modelRegistry.getConnectedModelIds()

    let plannerModel: { id: string; reason: string } | null = null
    let reviewerModel: { id: string; reason: string } | null = null
    let coderModels: Array<{ id: string; reason: string; task: string }> = []

    if (complexity === 'simple') {
      reasoning.push('Planlama asamasi atlandi — basit gorev, tek coder yeterli')
      const codeModel = this.selectModel('code', connected)
      coderModels = [{ id: codeModel.id, reason: codeModel.reason, task: request }]
    } else {
      const thinkModel = this.selectModel('think', connected)
      plannerModel = { id: thinkModel.id, reason: thinkModel.reason }
      reasoning.push(`Planner: ${thinkModel.id}`)

      const coderCount = complexity === 'medium' ? 2 : Math.min(4, this.estimateSubtasks(request))
      const codeModel = this.selectModel('code', connected)
      coderModels = Array.from({ length: coderCount }, (_, i) => ({
        id: codeModel.id,
        reason: `Paralel coder ${i + 1}/${coderCount} — $${modelRegistry.getById(codeModel.id)?.inputPrice || 0.6}/1M giris`,
        task: `Alt gorev ${i + 1} (planlama asamasinda detaylandirilacak)`,
      }))
      reasoning.push(`${coderCount} paralel coder baslatilacak`)

      const reviewModel = this.selectModel('review', connected)
      reviewerModel = { id: reviewModel.id, reason: reviewModel.reason }
    }

    const contextFiles = await this.selectContextFiles(request, taskType, ctx)
    reasoning.push(`Context: ${contextFiles.map(f => f.path).join(', ') || 'yok'}`)

    if (!connected.length) {
      warnings.push('Hic bagli model yok! Katalog modelleri kullaniliyor — calismayabilir')
    }

    const decision: DecomposeDecision = {
      taskType,
      complexity,
      reasoning,
      plannerModel,
      coderModels,
      reviewerModel,
      contextFiles,
      estimatedTokens: 0,
      estimatedCost: 0,
      estimatedMinutes: this.estimateMinutes(complexity, coderModels.length),
      warnings,
    }

    decision.estimatedTokens = this.estimateTokens(decision)
    decision.estimatedCost = this.estimateCost(decision)

    if (decision.estimatedCost > 0.5) {
      warnings.push(`Tahmini maliyet yuksek ($${decision.estimatedCost.toFixed(2)}) — /bcs-optimize onerilerini gozden gecir`)
    }

    db.saveDecomposeDecision({
      userRequest: request,
      taskType: decision.taskType,
      complexity: decision.complexity,
      plannerModel: decision.plannerModel?.id || null,
      coderModels: JSON.stringify(decision.coderModels),
      reviewerModel: decision.reviewerModel?.id || null,
      contextFiles: JSON.stringify(decision.contextFiles),
      estimatedTokens: decision.estimatedTokens,
      estimatedCost: decision.estimatedCost,
      estimatedMinutes: decision.estimatedMinutes,
      reasoning: JSON.stringify(decision.reasoning),
      warnings: JSON.stringify(decision.warnings),
    })

    return decision
  }

  formatDecision(d: DecomposeDecision): string {
    const lines = [
      '## Better Code Soul — Gorev Analizi',
      '',
      `**Gorev tipi:** ${d.taskType} · **Karmasiklik:** ${d.complexity}`,
      '',
      '**Karar surecim:**',
      ...d.reasoning.map(r => `- ${r}`),
      '',
      '**Model plani:**',
    ]

    if (d.plannerModel) {
      lines.push(`- Planlama: \`${d.plannerModel.id}\` — ${d.plannerModel.reason}`)
    }
    d.coderModels.forEach((m, i) => {
      lines.push(`- Coder ${String.fromCharCode(65 + i)}: \`${m.id}\` — ${m.reason}`)
    })
    if (d.reviewerModel) {
      lines.push(`- Review: \`${d.reviewerModel.id}\` — ${d.reviewerModel.reason}`)
    }

    lines.push('')
    lines.push('**Context dosyalari:**')
    d.contextFiles.forEach(f => lines.push(`- \`${f.path}\` — ${f.reason}`))

    lines.push('')
    lines.push(`**Tahmini:** ${d.estimatedTokens.toLocaleString()} token · $${d.estimatedCost.toFixed(4)} · ~${d.estimatedMinutes} dakika`)

    if (d.warnings.length > 0) {
      lines.push('')
      lines.push('**Uyarilar:**')
      d.warnings.forEach(w => lines.push(`- ${w}`))
    }

    return lines.join('\n')
  }

  toPlan(d: DecomposeDecision, request: string): TaskPlan {
    const affectedDirs: string[] = []
    for (const [pattern, dirs] of Object.entries(DIR_HINTS)) {
      if (new RegExp(pattern, 'i').test(request)) {
        affectedDirs.push(...dirs)
      }
    }

    if (d.complexity === 'simple') {
      return {
        strategy: 'sequential',
        plannerTask: d.plannerModel ? `"${request}" hatasinin kaynağını bul.` : '',
        coderTasks: [{
          id: 'A',
          task: request,
          directory: affectedDirs[0] || '.',
          files: [],
        }],
        reviewTask: d.reviewerModel ? `"${request}" — duzeltmenin dogru calistigini dogrula` : '',
        estimatedCost: d.estimatedCost,
        estimatedMinutes: d.estimatedMinutes,
      }
    }

    if (d.taskType === 'review') {
      return {
        strategy: 'sequential',
        plannerTask: d.plannerModel ? `"${request}" icin review scope'u belirle.` : '',
        coderTasks: [],
        reviewTask: `${request} — detayli inceleme yap, sorunlari listele`,
        estimatedCost: d.estimatedCost,
        estimatedMinutes: d.estimatedMinutes,
      }
    }

    if (d.taskType === 'research') {
      return {
        strategy: 'sequential',
        plannerTask: d.plannerModel ? `"${request}" hakkinda bilgi topla, dokumantasyon ve ornekler bul.` : '',
        coderTasks: [],
        reviewTask: '',
        estimatedCost: d.estimatedCost,
        estimatedMinutes: d.estimatedMinutes,
      }
    }

    const coderTasks: CoderTask[] = d.coderModels.map((m, i) => ({
      id: String.fromCharCode(65 + i),
      task: m.task,
      directory: affectedDirs[i] || '.',
      files: [],
    }))

    return {
      strategy: 'plan-code-review',
      plannerTask: d.plannerModel ? `"${request}" icin mimari plan yap. Hangi dosyalar olusturulacak/degistirilecek listele. Her dosya icin 1-2 cumle aciklama yaz. Sadece plan yap, kod yazma.` : '',
      coderTasks,
      reviewTask: d.reviewerModel ? `Tum parçaların tip uyumunu, API kontratini ve RULES.md'ye uygunlugunu dogrula` : '',
      estimatedCost: d.estimatedCost,
      estimatedMinutes: d.estimatedMinutes,
    }
  }
}

export const taskDecomposer = new TaskDecomposer()
