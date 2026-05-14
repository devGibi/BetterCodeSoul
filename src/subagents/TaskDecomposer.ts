import fs from 'node:fs'
import path from 'node:path'
import type { Model } from '../services/ModelRegistry.js'

export type TaskType = 'feature' | 'fix' | 'refactor' | 'review' | 'research'

export interface DecomposeContext {
  projectPath: string
  contextFiles: string[]
  availableModels: string[]
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
  feature: /ekle|implement|yaz|oluştur|create|add|build/i,
  fix: /düzelt|fix|hata|bug|broken|çalışmıyor/i,
  refactor: /refactor|temizle|yeniden yaz|clean|reorganize/i,
  review: /incele|review|kontrol|check|analiz/i,
  research: /araştır|nedir|nasıl|ne zaman|research|explain/i,
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
  detectTaskType(request: string): TaskType {
    for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
      if (pattern.test(request)) return type as TaskType
    }
    return 'feature'
  }

  async inferAffectedFiles(request: string, projectPath: string): Promise<string[]> {
    const matchedDirs: string[] = []
    for (const [pattern, dirs] of Object.entries(DIR_HINTS)) {
      if (new RegExp(pattern, 'i').test(request)) {
        matchedDirs.push(...dirs)
      }
    }

    return matchedDirs.filter((dir) => {
      try {
        return fs.existsSync(path.join(projectPath, dir))
      } catch {
        return false
      }
    })
  }

  async decompose(request: string, ctx: DecomposeContext): Promise<TaskPlan> {
    const taskType = this.detectTaskType(request)
    const affectedDirs = await this.inferAffectedFiles(request, ctx.projectPath)

    switch (taskType) {
      case 'feature':
        return this.decomposeFeature(request, affectedDirs, ctx)
      case 'fix':
        return this.decomposeFix(request, affectedDirs, ctx)
      case 'refactor':
        return this.decomposeRefactor(request, affectedDirs, ctx)
      case 'review':
        return this.decomposeReview(request, affectedDirs, ctx)
      case 'research':
        return this.decomposeResearch(request, ctx)
      default:
        return this.decomposeFeature(request, affectedDirs, ctx)
    }
  }

  private decomposeFeature(request: string, dirs: string[], ctx: DecomposeContext): TaskPlan {
    const coderCount = Math.min(dirs.length || 1, 4)

    const coderTasks: CoderTask[] = dirs.length > 0
      ? dirs.slice(0, coderCount).map((dir, i) => ({
          id: String.fromCharCode(65 + i),
          task: `${request} — ${dir} dizinindeki kısmı implement et`,
          directory: dir,
          files: [],
        }))
      : [{
          id: 'A',
          task: request,
          directory: '.',
          files: [],
        }]

    return {
      strategy: 'plan-code-review',
      plannerTask: `"${request}" için mimari plan yap. Hangi dosyalar oluşturulacak/değiştirilecek listele. Her dosya için 1-2 cümle açıklama yaz. Sadece plan yap, kod yazma.`,
      coderTasks,
      reviewTask: `Tüm parçaların tip uyumunu, API kontratını ve RULES.md'ye uygunluğunu doğrula`,
      estimatedCost: this.estimateCost(1, coderCount, coderCount, ctx.availableModels),
      estimatedMinutes: this.estimateTime(coderCount),
    }
  }

  private decomposeFix(request: string, dirs: string[], ctx: DecomposeContext): TaskPlan {
    return {
      strategy: 'sequential',
      plannerTask: `"${request}" hatasının kaynağını bul. Hangi dosya/larda sorun var belirle.`,
      coderTasks: [{
        id: 'A',
        task: `${request} — hatayı düzelt`,
        directory: dirs[0] || '.',
        files: [],
      }],
      reviewTask: `Düzeltmenin doğru çalıştığını ve başka yerlerde sorun yaratmadığını doğrula`,
      estimatedCost: this.estimateCost(1, 1, 1, ctx.availableModels),
      estimatedMinutes: 3,
    }
  }

  private decomposeRefactor(request: string, dirs: string[], ctx: DecomposeContext): TaskPlan {
    const coderCount = Math.min(dirs.length || 1, 3)
    const coderTasks: CoderTask[] = dirs.length > 0
      ? dirs.slice(0, coderCount).map((dir, i) => ({
          id: String.fromCharCode(65 + i),
          task: `${request} — ${dir} dizinini refactor et`,
          directory: dir,
          files: [],
        }))
      : [{ id: 'A', task: request, directory: '.', files: [] }]

    return {
      strategy: 'plan-code-review',
      plannerTask: `"${request}" için refactor planı yap. Mevcut yapıyı analiz et, hedef yapıyı tanımla.`,
      coderTasks,
      reviewTask: `Refactor sonrası mevcut testlerin hala geçtiğini ve davranışın değişmediğini doğrula`,
      estimatedCost: this.estimateCost(1, coderCount, coderCount, ctx.availableModels),
      estimatedMinutes: this.estimateTime(coderCount),
    }
  }

  private decomposeReview(request: string, dirs: string[], ctx: DecomposeContext): TaskPlan {
    return {
      strategy: 'sequential',
      plannerTask: `"${request}" için review scope'u belirle.`,
      coderTasks: [],
      reviewTask: `${request} — detaylı inceleme yap, sorunları listele`,
      estimatedCost: this.estimateCost(1, 0, 1, ctx.availableModels),
      estimatedMinutes: 2,
    }
  }

  private decomposeResearch(request: string, ctx: DecomposeContext): TaskPlan {
    return {
      strategy: 'sequential',
      plannerTask: `"${request}" hakkında bilgi topla, dokümantasyon ve örnekler bul.`,
      coderTasks: [],
      reviewTask: '',
      estimatedCost: this.estimateCost(1, 0, 0, ctx.availableModels),
      estimatedMinutes: 2,
    }
  }

  private estimateCost(planners: number, coders: number, reviewers: number, _availableModels: string[]): number {
    const AVG_TOKENS = {
      plan: { input: 3000, output: 2000 },
      code: { input: 4000, output: 2000 },
      review: { input: 2000, output: 800 },
    }

    const planCost = planners * ((AVG_TOKENS.plan.input / 1e6) * 1.25 + (AVG_TOKENS.plan.output / 1e6) * 10)
    const codeCost = coders * ((AVG_TOKENS.code.input / 1e6) * 0.60 + (AVG_TOKENS.code.output / 1e6) * 2.5)
    const reviewCost = reviewers * ((AVG_TOKENS.review.input / 1e6) * 0.80 + (AVG_TOKENS.review.output / 1e6) * 4)

    return planCost + codeCost + reviewCost
  }

  private estimateTime(coderCount: number): number {
    return 2 + 3 + 1
  }
}

export const taskDecomposer = new TaskDecomposer()
