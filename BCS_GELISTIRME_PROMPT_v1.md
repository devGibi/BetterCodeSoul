# Better Code Soul — Faz 2 Geliştirme Promptu
> Mevcut plugin koduna uygulanacak. Yeni dosya + mevcut dosyalara ekleme.
> Sırayla uygula, her adımdan sonra `npm run build` çalıştır.

---

## MEVCUT DURUM (ne var, ne eksik)

### Var olan ✅
- `/bcs-*` slash komutları çalışıyor
- SQLite kayıt sistemi var
- Graphify + Context Mode toggle var
- Paralel subagent iskelet var
- `better-code-soul setup` CLI var

### Eksik olan ❌ — Bu prompt bunları ekler

1. **TUI Dashboard** — OpenCode CLI içinde `/bcs` komutuyla açılan, tüm durumu gösteren mini yönetim paneli
2. **Deterministik Görev Ayrıştırıcı** — Kullanıcı isteğini parse edip hangi model / strateji / context seti kullanılacağını açıkça belirleyen katman
3. **Model Router** — Yeni model çıkınca sadece tek dosya değişecek şekilde izole edilmiş router
4. **Graphify'ın hafıza katmanı olarak entegrasyonu** — Sadece install/toggle değil, her session'da proaktif olarak grafiği sorgulayan ve context'e enjekte eden servis
5. **Hook → State → Dashboard zinciri** — tool.execute.* hook'ları → merkezi state → TUI'ya yansıma

---

## GÖREV 1 — TUI DASHBOARD (En Kritik)

OpenCode CLI zaten terminal tabanlı. Bizim TUI'muz da terminal içinde çalışacak —
`/bcs` komutuna basınca ekranı kaplayıp ESC ile kapanan interaktif bir panel.

### Kullanılacak kütüphane

```bash
npm install blessed blessed-contrib
npm install --save-dev @types/blessed
```

`blessed` — Node.js için battle-tested TUI framework. Kutu, tablo, gauge, log stream.
`blessed-contrib` — blessed üstüne grafik, sparkline, tablo bileşenleri.

### Yeni dosya: `src/tui/Dashboard.ts`

```typescript
// src/tui/Dashboard.ts
//
// /bcs komutuyla açılan tam ekran TUI dashboard.
// ESC veya 'q' ile kapanır, OpenCode'a geri döner.
// Blessed framework kullanır.
//
// LAYOUT (80x24 terminal varsayımı, büyük terminalde genişler):
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  BETTER CODE SOUL  v0.x.x          [TAB: sekme değiştir]  [ESC: kapat]    │
// ├──────────────┬──────────────┬──────────────┬─────────────────────────────  │
// │ DURUM        │ TOKEN        │ MALİYET      │ AKTİF MODEL                   │
// │ ● Aktif      │ 12.8K        │ $0.04        │ claude-sonnet-4-5 [KOD]       │
// │ 3 bağlantı   │ bugün        │ bugün        │ Anthropic · OAuth             │
// ├──────────────┴──────────────┴──────────────┴─────────────────────────────  │
// │ [1] GENEL  [2] MODELLER  [3] AGENTLAR  [4] ARAÇLAR  [5] OPTİMİZE         │
// ├─────────────────────────────────────────────────────────────────────────────│
// │                         (sekme içeriği)                                     │
// │                                                                             │
// │                                                                             │
// └─────────────────────────────────────────────────────────────────────────────┘
// │ [G]raphify: ● Aktif   [C]ontext Mode: ● Aktif   Son güncelleme: 3 sn önce │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// SEKME 1 — GENEL:
//   Sol: 7 günlük token bar chart (blessed-contrib sparkline)
//   Sağ: Context dolum gauge (aktif modelin context penceresine göre)
//         Graphify graf istatistikleri (düğüm/bağlantı/son build)
//         Context Mode tasarruf özeti (bu session KB tasarruf)
//
// SEKME 2 — MODELLER:
//   Tablo: Model adı | Tier | Fiyat | Kaynak | Durum
//   Kaynak: [🔗 OAUTH] [🔑 API] [⚫ KATALOG]
//   Tier rengi: think=sarı, code=mor, review=yeşil
//   Aktif model kalın + yeşil satır
//   [A] tuşu → aktif modeli değiştir (blessed input prompt)
//
// SEKME 3 — AGENTLAR (Son Orkestrasyon):
//   Eğer son /bcs-agent çalıştıysa göster:
//     Plan aşaması: ████████████ ✓ (gemini-2.5-pro · 2.1K tok · $0.002)
//     Coder A:      ████████████ ✓ (kimi-k2 · 3.4K tok · $0.003)
//     Coder B:      ████████████ ✓ (kimi-k2 · 2.8K tok · $0.002)
//     Reviewer A:   ████████████ ✓ (haiku · 1.1K tok · $0.001)
//     Reviewer B:   ████████████ ✓ (haiku · 0.9K tok · $0.001)
//     ─────────────────────────────────────────────────
//     Toplam: 10.3K tok · $0.009 · 23 saniye
//   Yoksa: "Henüz /bcs-agent kullanılmadı. Büyük görevler için /bcs-agent 'açıklama' yaz."
//
// SEKME 4 — ARAÇLAR:
//   Graphify bölümü:
//     Durum: [● KURULU / ✗ YOK]
//     OpenCode entegrasyonu: [● AKTİF / ○ PASİF]  →  [G] toggle
//     Graf: 847 düğüm · 2.341 bağlantı · 12.4 MB · Son build: 3 saat önce
//     [B] Build/Güncelle  [I] Kur (yoksa)
//   ───────────────────────────────────────
//   Context Mode bölümü:
//     Durum: [● KURULU / ✗ YOK]
//     OpenCode entegrasyonu: [● AKTİF / ○ PASİF]  →  [C] toggle
//     Bu session: 315 KB → 5.4 KB (%98 tasarruf)
//     [D] Doctor  [I] Kur (yoksa)
//
// SEKME 5 — OPTİMİZE:
//   Optimize kurallarının çıktısını göster (bcs_optimize.ts'den aynı mantık)
//   Her öneri bir satırda, üstünde ikon:
//     ⚠ PLAN tier kullanım oranın %72. Kod için sonnet yeterli. $X/hafta tasarruf.
//     💡 Context Mode aktif değil. Aktifleştir: [C] tuşu
//     ✓ Graphify aktif ve güncel.

import blessed from 'blessed'
import contrib from 'blessed-contrib'
import { Database } from '../services/Database'
import { AuthReader } from '../services/AuthReader'
import { ModelRegistry } from '../services/ModelRegistry'
import { GraphifyService } from '../services/GraphifyService'
import { ContextModeService } from '../services/ContextModeService'
import { optimizationRules } from '../tools/bcs_optimize'

export class Dashboard {
  private screen: blessed.Widgets.Screen
  private grid: any  // blessed-contrib grid
  private currentTab = 1
  private refreshInterval: NodeJS.Timeout | null = null

  constructor(
    private db: Database,
    private authReader: AuthReader,
    private modelRegistry: ModelRegistry,
    private graphify: GraphifyService,
    private contextMode: ContextModeService,
  ) {}

  async open(): Promise<void> {
    // Blessed screen oluştur
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Better Code Soul',
      fullUnicode: true,
    })

    // Grid layout (12 sütun, 12 satır)
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen })

    // Header bar
    this.renderHeader()

    // Tab bar
    this.renderTabBar()

    // Status bar (alt)
    this.renderStatusBar()

    // İlk sekmeyi göster
    await this.renderTab(1)

    // Klavye kısayolları
    this.setupKeys()

    // 3 saniyede bir otomatik yenile
    this.refreshInterval = setInterval(() => this.refresh(), 3000)

    // Ekranı çiz
    this.screen.render()

    // Dashboard kapanana kadar bekle
    return new Promise(resolve => {
      this.screen.once('destroy', resolve)
    })
  }

  private setupKeys(): void {
    // Kapat
    this.screen.key(['escape', 'q'], () => {
      if (this.refreshInterval) clearInterval(this.refreshInterval)
      this.screen.destroy()
    })

    // Sekme değiştir
    this.screen.key(['1'], () => this.switchTab(1))
    this.screen.key(['2'], () => this.switchTab(2))
    this.screen.key(['3'], () => this.switchTab(3))
    this.screen.key(['4'], () => this.switchTab(4))
    this.screen.key(['5'], () => this.switchTab(5))

    // Sekme 4'e özel eylemler
    this.screen.key(['g', 'G'], async () => {
      if (this.currentTab !== 4) return
      await this.graphify.toggle(process.cwd())
      await this.renderTab(4)
      this.screen.render()
    })

    this.screen.key(['c', 'C'], async () => {
      if (this.currentTab !== 4) return
      await this.contextMode.toggle(process.cwd())
      await this.renderTab(4)
      this.screen.render()
    })

    this.screen.key(['b', 'B'], async () => {
      if (this.currentTab !== 4) return
      // Graphify build — progress göster
      await this.showGraphifyBuild()
    })

    // Sekme 2'ye özel: model değiştir
    this.screen.key(['a', 'A'], async () => {
      if (this.currentTab !== 2) return
      await this.showModelSwitcher()
    })
  }

  // Her sekmenin içeriği async render:
  private async renderTab(tab: number): Promise<void> {
    // Önceki tab widget'larını temizle (grid orta alanını sıfırla)
    this.clearTabArea()
    this.currentTab = tab

    switch (tab) {
      case 1: await this.renderOverviewTab(); break
      case 2: await this.renderModelsTab(); break
      case 3: await this.renderAgentsTab(); break
      case 4: await this.renderToolsTab(); break
      case 5: await this.renderOptimizeTab(); break
    }

    this.screen.render()
  }

  private async renderOverviewTab(): Promise<void> {
    const usage = await this.db.getUsageHistory(7)
    const todayStats = await this.db.getTodayStats()
    const graphifyStats = await this.graphify.getStats(process.cwd())
    const ctxStats = await this.contextMode.getStats()

    // Sol: 7 günlük token sparkline
    const sparkline = this.grid.set(3, 0, 6, 6, contrib.sparkline, {
      label: ' Token Kullanımı (7 gün) ',
      tags: true,
      border: { type: 'line' },
      style: { fg: 'cyan', border: { fg: 'cyan' } },
    })
    sparkline.setData(
      ['Token (K)'],
      [usage.map(u => Math.round(u.tokens / 1000))]
    )

    // Sağ üst: context dolum gauge
    const gauge = this.grid.set(3, 6, 3, 6, contrib.gauge, {
      label: ' Context Dolumu ',
      stroke: 'green',
      fill: 'white',
      border: { type: 'line' },
    })
    const activeModel = await this.modelRegistry.getActive()
    const ctxPct = todayStats.totalTokens / (activeModel?.contextWindow || 200000) * 100
    gauge.setPercent(Math.min(Math.round(ctxPct), 100))

    // Sağ alt: araç durumu kutusu
    const toolBox = this.grid.set(6, 6, 3, 6, blessed.box, {
      label: ' Araç Durumu ',
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: this.buildToolStatusContent(graphifyStats, ctxStats),
      tags: true,
    })
  }

  private buildToolStatusContent(graphify: any, ctx: any): string {
    const on = '{green-fg}● AKTİF{/green-fg}'
    const off = '{red-fg}○ PASİF{/red-fg}'

    return [
      `Graphify: ${graphify?.active ? on : off}`,
      graphify?.active ? `  ${graphify.nodeCount} düğüm · ${graphify.edgeCount} bağlantı` : '  /bcs-graphify install',
      '',
      `Context Mode: ${ctx?.active ? on : off}`,
      ctx?.active ? `  Bu session: %${ctx.efficiencyPercent} tasarruf` : '  /bcs-context-mode install',
    ].join('\n')
  }

  private async renderModelsTab(): Promise<void> {
    const models = await this.modelRegistry.listAll()
    const connected = await this.authReader.getConnected()
    const connectedIds = new Set(connected.flatMap(p => p.models || []))

    const tableData = models.map(m => {
      const source = connectedIds.has(m.id) ? '🔗 OAUTH' :
                     m.hasApiKey ? '🔑 API' : '⚫ KAT.'
      const tierColor = { think: 'yellow', code: 'magenta', review: 'green' }[m.tier] || 'white'
      return [m.name, m.tier.toUpperCase(), `$${m.inputPrice}/$${m.outputPrice}`, source]
    })

    const table = this.grid.set(3, 0, 8, 12, contrib.table, {
      label: ' Modeller — [A] Aktif modeli değiştir ',
      keys: true,
      fg: 'white',
      selectedFg: 'black',
      selectedBg: 'green',
      interactive: true,
      border: { type: 'line' },
      columnSpacing: 3,
      columnWidth: [28, 8, 16, 12],
      style: { border: { fg: 'cyan' } },
    })

    table.setData({
      headers: ['Model', 'Tier', 'Fiyat (G/Ç)', 'Kaynak'],
      data: tableData,
    })

    table.focus()
  }

  private async renderAgentsTab(): Promise<void> {
    const lastOrch = await this.db.getLastOrchestration()

    if (!lastOrch) {
      const box = this.grid.set(3, 0, 8, 12, blessed.box, {
        label: ' Son Orkestrasyon ',
        border: { type: 'line' },
        content: [
          '',
          '  Henüz /bcs-agent kullanılmadı.',
          '',
          '  Büyük görevler için:',
          '  {cyan-fg}/bcs-agent "kullanıcı profil sayfası ekle"{/cyan-fg}',
          '',
          '  Better Code Soul görevi otomatik olarak:',
          '    1. PlannerAgent ile mimari plan yapar',
          '    2. Paralel CoderAgent\'lara dağıtır',
          '    3. ReviewerAgent ile doğrular',
          '    4. Sonuçları birleştirir',
        ].join('\n'),
        tags: true,
        style: { border: { fg: 'cyan' } },
      })
      return
    }

    // Son orkestrasyon varsa göster
    const steps = JSON.parse(lastOrch.stepsJson || '[]')
    let content = `  Görev: ${lastOrch.userRequest}\n`
    content += `  ${'─'.repeat(60)}\n`

    steps.forEach((step: any) => {
      const bar = '█'.repeat(Math.floor(step.durationMs / 500)).padEnd(20, '░')
      const status = step.success ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}'
      content += `  ${step.role.padEnd(12)} ${bar} ${status} (${step.model} · ${(step.inputTokens + step.outputTokens).toLocaleString()} tok · $${step.cost.toFixed(4)})\n`
    })

    content += `  ${'─'.repeat(60)}\n`
    content += `  Toplam: ${lastOrch.totalTokens.toLocaleString()} tok · $${lastOrch.totalCost.toFixed(4)} · ${Math.round(lastOrch.durationMs / 1000)} saniye\n`

    const box = this.grid.set(3, 0, 8, 12, blessed.box, {
      label: ' Son Orkestrasyon — ' + new Date(lastOrch.createdAt).toLocaleString('tr-TR'),
      border: { type: 'line' },
      content,
      tags: true,
      style: { border: { fg: 'magenta' } },
    })
  }

  private async renderToolsTab(): Promise<void> {
    const gStatus = await this.graphify.getFullStatus(process.cwd())
    const cStatus = await this.contextMode.getFullStatus(process.cwd())

    // Graphify kutusu
    const gBox = this.grid.set(3, 0, 4, 6, blessed.box, {
      label: ' Graphify — Hafıza Sistemi ',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: gStatus.installed ? 'green' : 'red' } },
      content: this.buildGraphifyContent(gStatus),
    })

    // Context Mode kutusu
    const cBox = this.grid.set(3, 6, 4, 6, blessed.box, {
      label: ' Context Mode — Token Tasarrufu ',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: cStatus.installed ? 'green' : 'red' } },
      content: this.buildContextModeContent(cStatus),
    })

    // Klavye kılavuzu
    const helpBox = this.grid.set(7, 0, 2, 12, blessed.box, {
      content: '  [G] Graphify toggle  [B] Graf build  [C] Context Mode toggle  [I] Kur (yoksa)',
      style: { fg: 'yellow' },
      tags: true,
    })
  }

  private buildGraphifyContent(s: any): string {
    if (!s.installed) return '\n  {red-fg}✗ Kurulu değil{/red-fg}\n\n  [I] tuşu ile kur\n  (pip install graphifyy gerekli)'
    const active = s.active ? '{green-fg}● AKTİF{/green-fg}' : '{yellow-fg}○ PASİF{/yellow-fg}'
    return [
      '',
      `  Durum: ${s.installed ? '{green-fg}● Kurulu{/green-fg}' : '{red-fg}✗ Yok{/red-fg}'}  v${s.version}`,
      `  OpenCode: ${active}  {yellow-fg}[G] toggle{/yellow-fg}`,
      '',
      s.stats ? `  Graf: ${s.stats.nodeCount} düğüm · ${s.stats.edgeCount} bağlantı` : '  Graf: henüz build edilmedi',
      s.stats ? `  Boyut: ${(s.stats.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '',
      s.stats ? `  Son build: ${timeSince(s.stats.lastBuilt)}` : '',
      '',
      '  {yellow-fg}[B] Build/Güncelle{/yellow-fg}',
    ].join('\n')
  }

  private buildContextModeContent(s: any): string {
    if (!s.installed) return '\n  {red-fg}✗ Kurulu değil{/red-fg}\n\n  [I] tuşu ile kur\n  (npm install -g context-mode gerekli)'
    const active = s.active ? '{green-fg}● AKTİF{/green-fg}' : '{yellow-fg}○ PASİF{/yellow-fg}'
    return [
      '',
      `  Durum: ${s.installed ? '{green-fg}● Kurulu{/green-fg}' : '{red-fg}✗ Yok{/red-fg}'}  v${s.version}`,
      `  OpenCode: ${active}  {yellow-fg}[C] toggle{/yellow-fg}`,
      '',
      s.stats ? `  Bu session: %${s.stats.efficiencyPercent} tasarruf` : '  Bu session: veri yok',
      s.stats ? `  Toplam: $${s.stats.savedTotal} tasarruf` : '',
      '',
      '  {yellow-fg}[D] Doctor  {/yellow-fg}',
    ].join('\n')
  }

  private async renderOptimizeTab(): Promise<void> {
    const stats = await this.db.getOptimizationStats()
    const graphifyActive = await this.graphify.isActive(process.cwd())
    const ctxActive = await this.contextMode.isActive(process.cwd())

    const issues = optimizationRules
      .filter(rule => rule.check({ ...stats, graphifyActive, contextModeActive: ctxActive }))
      .map(rule => rule.message({ ...stats, graphifyActive, contextModeActive: ctxActive }))

    let content = issues.length === 0
      ? '\n  {green-fg}✓ Her şey optimize görünüyor!{/green-fg}'
      : issues.map(msg => `  ⚠ ${msg}`).join('\n\n  ─────────────────────────────\n\n')

    const box = this.grid.set(3, 0, 8, 12, blessed.box, {
      label: ' Optimizasyon Önerileri ',
      border: { type: 'line' },
      content,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      style: { border: { fg: 'yellow' } },
    })
  }

  private renderHeader(): void {
    // Üst stat bar — 4 kart yan yana
    // Her kart: küçük label + büyük değer
    // Blessed box'lar kullan, her biri %25 genişlik
    // Veri: db.getTodayStats() + authReader + modelRegistry.getActive()
    // Bu metodu implement et, tüm veriyi async alıp widget'lara set et
  }

  private renderTabBar(): void {
    const tabBar = blessed.box({
      parent: this.screen,
      top: 6,
      left: 0,
      width: '100%',
      height: 1,
      content: ' {bold}[1]{/bold} GENEL  {bold}[2]{/bold} MODELLER  {bold}[3]{/bold} AGENTLAR  {bold}[4]{/bold} ARAÇLAR  {bold}[5]{/bold} OPTİMİZE  {gray-fg}[ESC] Kapat{/gray-fg}',
      tags: true,
      style: { bg: 'blue', fg: 'white' },
    })
  }

  private renderStatusBar(): void {
    // Alt durum barı — her 3 saniyede güncellenir
    // İçerik: Graphify durumu · Context Mode durumu · Son güncelleme zamanı
  }

  private clearTabArea(): void {
    // Grid'in orta alanını temizle (header ve status bar hariç)
    // Blessed'da: tüm children'ı detach edip yeniden çiz
  }

  private async refresh(): Promise<void> {
    await this.renderTab(this.currentTab)
  }

  private async switchTab(tab: number): Promise<void> {
    this.currentTab = tab
    await this.renderTab(tab)
  }

  private async showModelSwitcher(): Promise<void> {
    // Input prompt aç: "Model ID gir veya tier: think/code/review"
    // Kullanıcı girince modelRegistry.setActive() çağır
    // Dashboard'u yenile
  }

  private async showGraphifyBuild(): Promise<void> {
    // Graphify build progress'i göstermek için log kutusu aç
    // graphify.build() generator'ını consume et, her satırı kutuya ekle
    // Bitince "✓ Graf güncellendi" göster
  }
}

function timeSince(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime()
  if (ms < 60000) return `${Math.round(ms/1000)} sn önce`
  if (ms < 3600000) return `${Math.round(ms/60000)} dk önce`
  return `${Math.round(ms/3600000)} saat önce`
}
```

### Dashboard'u plugin'e bağla

```typescript
// src/tools/bcs_dashboard.ts
// /bcs komutu → Dashboard açar

tools: {
  bcs: {
    description: 'Better Code Soul yönetim panelini aç (TAB: sekme, ESC: kapat)',
    parameters: {},
    execute: async () => {
      const dashboard = new Dashboard(db, authReader, modelRegistry, graphify, contextMode)
      await dashboard.open()
      // Dashboard kapanınca (ESC), kontrol OpenCode'a döner
      return ''  // boş string → OpenCode'da ekstra çıktı gösterme
    }
  }
}
```

---

## GÖREV 2 — DETERMİNİSTİK GÖREV AYRIŞTIRICI

Mevcut `TaskDecomposer.ts` keyword tabanlı çalışıyor ama çıktısı belirsiz.
Bu görev onu **açık ve izlenebilir** hale getirir.

### `src/subagents/TaskDecomposer.ts` — Tamamen yeniden yaz

```typescript
// Her decompose çağrısı artık bir DecomposeDecision üretir.
// Bu karar hem log'a hem SQLite'a yazılır.
// /bcs-agent çıktısında kullanıcıya gösterilir.

export interface DecomposeDecision {
  // Görev hakkında
  taskType: 'feature' | 'fix' | 'refactor' | 'review' | 'research' | 'unknown'
  complexity: 'simple' | 'medium' | 'complex'  // kaç agent kullanılacak
  reasoning: string[]  // neden bu kararlar verildi — kullanıcıya gösterilir

  // Model kararları — her biri için neden seçildi açıklanır
  plannerModel: { id: string; reason: string } | null  // simple'da null (planner atlanır)
  coderModels: Array<{ id: string; reason: string; task: string }>
  reviewerModel: { id: string; reason: string } | null  // simple'da null

  // Context kararları
  contextFiles: Array<{ path: string; reason: string }>  // hangi dosyalar, neden
  estimatedTokens: number
  estimatedCost: number
  estimatedMinutes: number

  // Uyarılar
  warnings: string[]  // "Bu model bağlı değil", "Maliyet yüksek" vb.
}

export class TaskDecomposer {

  async decompose(request: string, ctx: DecomposeContext): Promise<DecomposeDecision> {
    const decision: Partial<DecomposeDecision> = {}
    const reasoning: string[] = []
    const warnings: string[] = []

    // ── 1. GÖREV TİPİ ──────────────────────────────────────────
    const taskType = this.detectTaskType(request)
    decision.taskType = taskType
    reasoning.push(`Görev tipi: ${taskType} (anahtar kelime: "${this.matchedKeyword(request)}")`)

    // ── 2. KARMAŞIKLIK ─────────────────────────────────────────
    const complexity = this.detectComplexity(request, ctx)
    decision.complexity = complexity
    reasoning.push(`Karmaşıklık: ${complexity} (${this.complexityReason(request, ctx)})`)

    // ── 3. MODEL SEÇİMİ ────────────────────────────────────────
    const connected = await this.authReader.getConnected()

    if (complexity === 'simple') {
      // Planner ve reviewer atla — tek coder yeterli
      decision.plannerModel = null
      decision.reviewerModel = null
      reasoning.push('Planlama aşaması atlandı — basit görev, tek coder yeterli')

      const codeModel = this.selectModel('code', connected)
      decision.coderModels = [{
        id: codeModel.id,
        reason: `En ucuz bağlı KOD tier modeli (${codeModel.inputPrice}$/1M giriş)`,
        task: request,
      }]
    } else {
      // Planner seç
      const thinkModel = this.selectModel('think', connected)
      decision.plannerModel = {
        id: thinkModel.id,
        reason: `En ucuz bağlı PLAN tier modeli — mimari karar için gerekli`,
      }

      // Coder sayısı: medium=2, complex=3-4
      const coderCount = complexity === 'medium' ? 2 : Math.min(4, this.estimateSubtasks(request))
      const codeModel = this.selectModel('code', connected)
      decision.coderModels = Array.from({ length: coderCount }, (_, i) => ({
        id: codeModel.id,
        reason: `Paralel coder ${i + 1}/${coderCount} — ${codeModel.inputPrice}$/1M giriş`,
        task: `Alt görev ${i + 1} (planlama aşamasında detaylandırılacak)`,
      }))
      reasoning.push(`${coderCount} paralel coder başlatılacak`)

      // Reviewer seç
      const reviewModel = this.selectModel('review', connected)
      decision.reviewerModel = {
        id: reviewModel.id,
        reason: `En ucuz bağlı REVİEW tier modeli — doğrulama için yeterli`,
      }
    }

    // ── 4. CONTEXT SEÇİMİ ──────────────────────────────────────
    // Her zaman RULES.md + PROGRESS.md
    // Feature/fix ise ilgili dizin dosyaları
    // Research ise sadece SPEC.md
    decision.contextFiles = await this.selectContextFiles(request, taskType, ctx)
    reasoning.push(`Context: ${decision.contextFiles.map(f => f.path).join(', ')}`)

    // ── 5. TAHMİN ──────────────────────────────────────────────
    decision.estimatedTokens = this.estimateTokens(decision as DecomposeDecision)
    decision.estimatedCost = this.estimateCost(decision as DecomposeDecision)
    decision.estimatedMinutes = this.estimateMinutes(decision as DecomposeDecision)

    // ── 6. UYARILAR ────────────────────────────────────────────
    if (!connected.some(p => p.connected)) {
      warnings.push('Hiç bağlı model yok! Katalog modelleri kullanılıyor — çalışmayabilir')
    }
    if (decision.estimatedCost! > 0.50) {
      warnings.push(`Tahmini maliyet yüksek ($${decision.estimatedCost!.toFixed(2)}) — /bcs-optimize önerilerini gözden geçir`)
    }

    decision.reasoning = reasoning
    decision.warnings = warnings

    // SQLite'a kaydet (audit trail)
    await this.db.saveDecomposeDecision({
      request,
      decision: JSON.stringify(decision),
      createdAt: Date.now(),
    })

    return decision as DecomposeDecision
  }

  // Karar özetini kullanıcıya göstermek için markdown üret
  formatDecision(d: DecomposeDecision): string {
    const lines = [
      '## 📋 Better Code Soul — Görev Analizi',
      '',
      `**Görev tipi:** ${d.taskType} · **Karmaşıklık:** ${d.complexity}`,
      '',
      '**Karar sürecim:**',
      ...d.reasoning.map(r => `- ${r}`),
      '',
      '**Model planı:**',
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
    lines.push('**Context dosyaları:**')
    d.contextFiles.forEach(f => lines.push(`- \`${f.path}\` — ${f.reason}`))

    lines.push('')
    lines.push(`**Tahmini:** ${d.estimatedTokens.toLocaleString()} token · $${d.estimatedCost.toFixed(4)} · ~${d.estimatedMinutes} dakika`)

    if (d.warnings.length > 0) {
      lines.push('')
      lines.push('**⚠ Uyarılar:**')
      d.warnings.forEach(w => lines.push(`- ${w}`))
    }

    return lines.join('\n')
  }

  private selectModel(tier: 'think' | 'code' | 'review', connected: AuthProvider[]): Model {
    const connectedIds = new Set(connected.flatMap(p => p.models || []))
    const candidates = this.modelRegistry
      .listAll()
      .filter(m => m.tier === tier && connectedIds.has(m.id))
      .sort((a, b) => a.inputPrice - b.inputPrice)  // en ucuzu seç

    if (candidates.length === 0) {
      // Bağlı model yok → kataloğun en ucuzu + uyarı
      return this.modelRegistry.listAll()
        .filter(m => m.tier === tier)
        .sort((a, b) => a.inputPrice - b.inputPrice)[0]
    }

    return candidates[0]
  }

  private detectComplexity(request: string, ctx: DecomposeContext): 'simple' | 'medium' | 'complex' {
    // Simple: tek dosya, küçük fix, review
    const simplePatterns = /düzelt|fix|rename|yeniden adlandır|sil|kaldır|comment|yorum/i
    if (simplePatterns.test(request)) return 'simple'

    // Complex: birden fazla sistem, migration, refactor, büyük feature
    const complexPatterns = /refactor|migration|auth|authentication|payment|ödeme|büyük|tüm|sistem/i
    if (complexPatterns.test(request)) return 'complex'

    return 'medium'
  }

  private async selectContextFiles(request: string, taskType: string, ctx: DecomposeContext) {
    const files = []

    // Her zaman dahil et
    if (await this.fileExists(ctx.projectPath, 'RULES.md')) {
      files.push({ path: 'RULES.md', reason: 'Kod kuralları — her zaman dahil' })
    }
    if (await this.fileExists(ctx.projectPath, 'PROGRESS.md')) {
      files.push({ path: 'PROGRESS.md', reason: 'Proje durumu — hangi kısımlar bitti' })
    }

    // Feature/fix/refactor → SPEC.md
    if (['feature', 'fix', 'refactor'].includes(taskType)) {
      if (await this.fileExists(ctx.projectPath, 'SPEC.md')) {
        files.push({ path: 'SPEC.md', reason: 'Proje tanımı — feature scope için gerekli' })
      }
    }

    // Research → DECISIONS.md
    if (taskType === 'research') {
      if (await this.fileExists(ctx.projectPath, 'DECISIONS.md')) {
        files.push({ path: 'DECISIONS.md', reason: 'Mimari kararlar — araştırma bağlamı' })
      }
    }

    // Graphify aktifse — graf bağlamı ekle (dosya okumak yerine)
    if (await this.graphify.isActive(ctx.projectPath)) {
      files.push({
        path: 'graphify-out/context.md',
        reason: 'Graphify bilgi grafiği — tüm proje yapısını özetler (binlerce token yerine ~500 token)',
      })
    }

    return files
  }
}
```

---

## GÖREV 3 — MODEL ROUTER (İzole Edilmiş)

Yeni model çıkınca **sadece bu dosya değişir**.

### Yeni dosya: `src/services/ModelRouter.ts`

```typescript
// src/services/ModelRouter.ts
//
// Tier → Model eşlemesi burada.
// ModelRegistry'den bağımsız — sadece routing mantığı.
// Yeni model çıkınca: bu dosyaya bir satır ekle, başka hiçbir şeye dokunma.

export type Tier = 'think' | 'code' | 'review'

export interface RouterCandidate {
  modelId: string
  reason: string
  priority: number  // düşük = öncelikli
}

// ── BURAYA YENİ MODEL EKLE ──────────────────────────────────────────────────
// Yeni model çıkınca sadece bu listeye satır ekle.
// priority: düşük sayı = daha önce denenecek
// ────────────────────────────────────────────────────────────────────────────

const ROUTING_TABLE: Record<Tier, RouterCandidate[]> = {
  think: [
    { modelId: 'gemini-2.5-pro',   reason: 'Geniş context + uygun fiyat ($1.25/1M)',  priority: 1 },
    { modelId: 'claude-opus-4-5',  reason: 'En güçlü akıl yürütme ama pahalı ($15/1M)', priority: 2 },
    { modelId: 'o3',               reason: 'OpenAI reasoning — API key gerekli',        priority: 3 },
  ],
  code: [
    { modelId: 'kimi-k2',          reason: 'Kod için iyi · çok ucuz ($0.60/1M)',        priority: 1 },
    { modelId: 'deepseek-v3',      reason: 'En ucuz seçenek ($0.27/1M)',               priority: 2 },
    { modelId: 'glm-4-plus',       reason: 'Zhipu — iyi kod kalitesi ($0.70/1M)',       priority: 3 },
    { modelId: 'claude-sonnet-4-5',reason: 'Fallback — kaliteli ama daha pahalı',       priority: 4 },
    { modelId: 'gpt-4o',           reason: 'OpenAI fallback',                           priority: 5 },
    { modelId: 'gemini-2.5-flash', reason: 'Google fallback — hızlı',                  priority: 6 },
  ],
  review: [
    { modelId: 'claude-haiku-4-5', reason: 'Hızlı + ucuz + kaliteli review ($0.80/1M)', priority: 1 },
    { modelId: 'gpt-4o-mini',      reason: 'Çok ucuz ($0.15/1M)',                       priority: 2 },
    { modelId: 'gemini-2.5-flash', reason: 'Google hızlı model',                        priority: 3 },
  ],
}

export class ModelRouter {
  constructor(
    private authReader: AuthReader,
    private modelRegistry: ModelRegistry,
  ) {}

  // Tier için en uygun bağlı modeli seç
  async route(tier: Tier): Promise<{ model: Model; candidate: RouterCandidate }> {
    const connected = await this.authReader.getConnected()
    const connectedIds = new Set(connected.flatMap(p => p.models || []))

    const candidates = ROUTING_TABLE[tier]
      .sort((a, b) => a.priority - b.priority)

    // Bağlı olanlar arasından öncelik sırasına göre seç
    for (const candidate of candidates) {
      if (connectedIds.has(candidate.modelId)) {
        const model = this.modelRegistry.getById(candidate.modelId)
        if (model) return { model, candidate }
      }
    }

    // Hiç bağlı model yok → kataloğun ilk sırasını ver, uyarı log'la
    const fallback = candidates[0]
    const model = this.modelRegistry.getById(fallback.modelId)!
    console.warn(`[BCS] ${tier} tier için bağlı model bulunamadı. Katalog fallback: ${fallback.modelId}`)
    return { model, candidate: { ...fallback, reason: fallback.reason + ' [BAĞLI DEĞİL — fallback]' } }
  }

  // Routing tablosunun açıklamasını döndür (bcs_status ve dashboard için)
  explainRouting(): string {
    const lines = ['## Model Router — Mevcut Öncelik Sırası\n']
    for (const [tier, candidates] of Object.entries(ROUTING_TABLE)) {
      lines.push(`### ${tier.toUpperCase()}`)
      candidates.forEach((c, i) => {
        lines.push(`${i + 1}. \`${c.modelId}\` — ${c.reason}`)
      })
      lines.push('')
    }
    lines.push('Yeni model eklemek için: `src/services/ModelRouter.ts` dosyasına satır ekle.')
    return lines.join('\n')
  }
}
```

---

## GÖREV 4 — GRAPHİFY: HAFIZA KATMANI OLARAK ENTEGRASYON

Mevcut Graphify sadece install/toggle yapıyor.
Bu görev onu her session'da **proaktif** hale getirir.

### `src/services/GraphifyService.ts` — Eklenecek metodlar

```typescript
// Mevcut dosyaya şu metodları EKLE (var olanları silme):

// Session başında context'e enjekte edilecek özet
async buildContextSummary(projectPath: string, userRequest: string): Promise<string | null> {
  if (!await this.isActive(projectPath)) return null

  const graphFile = path.join(projectPath, 'graphify-out', 'graph.json')
  if (!fs.existsSync(graphFile)) return null

  const graph = JSON.parse(await fs.readFile(graphFile, 'utf-8'))

  // Kullanıcı isteğine göre alakalı düğümleri filtrele
  const keywords = this.extractKeywords(userRequest)
  const relevantNodes = this.findRelevantNodes(graph, keywords)

  if (relevantNodes.length === 0) return null

  // Kompakt özet üret (maksimum 500 token hedefle)
  return [
    '<!-- Graphify Bağlam Özeti (otomatik) -->',
    `Proje: ${graph.metadata?.projectName || path.basename(projectPath)}`,
    `İlgili dosyalar (${relevantNodes.length} adet):`,
    ...relevantNodes.slice(0, 10).map(n =>
      `- ${n.path}: ${n.summary || n.description || '(özet yok)'}`
    ),
    relevantNodes.length > 10 ? `... ve ${relevantNodes.length - 10} dosya daha` : '',
    '<!-- /Graphify -->',
  ].filter(Boolean).join('\n')
}

private extractKeywords(request: string): string[] {
  // Kısa kelimeler ve stop words'leri çıkar
  const stopWords = new Set(['ve', 'ile', 'için', 'bir', 'bu', 'the', 'a', 'an', 'for', 'and'])
  return request
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
}

private findRelevantNodes(graph: any, keywords: string[]): any[] {
  const nodes = graph.nodes || []
  return nodes
    .filter((n: any) => {
      const text = `${n.path} ${n.summary || ''} ${n.tags?.join(' ') || ''}`.toLowerCase()
      return keywords.some(kw => text.includes(kw))
    })
    .slice(0, 20)
}

// Graf'ın güncel olup olmadığını kontrol et
async needsRebuild(projectPath: string): Promise<boolean> {
  const graphFile = path.join(projectPath, 'graphify-out', 'graph.json')
  if (!fs.existsSync(graphFile)) return true

  const stat = await fs.stat(graphFile)
  const ageHours = (Date.now() - stat.mtimeMs) / 3600000

  // 6 saatten eski ise yeniden build öner
  return ageHours > 6
}

// getFullStatus — dashboard için tam durum objesi
async getFullStatus(projectPath: string): Promise<GraphifyFullStatus> {
  return {
    installed: await this.isInstalled(),
    version: await this.getVersion(),
    active: await this.isActive(projectPath),
    stats: await this.getStats(projectPath),
    needsRebuild: await this.needsRebuild(projectPath),
  }
}
```

### `src/hooks/systemTransform.ts` — Graphify enjeksiyonu

```typescript
// Mevcut systemTransform hook'una şunu ekle:

'experimental.chat.system.transform': async (system, context) => {
  let injection = '\n\n<!-- Better Code Soul -->\n'

  // Graphify bağlam özeti (kullanıcı isteğine göre alakalı düğümler)
  const userRequest = context?.lastUserMessage || ''
  const graphifyContext = await graphifyService.buildContextSummary(process.cwd(), userRequest)
  if (graphifyContext) {
    injection += graphifyContext + '\n'
  }

  // Graf güncellenmesi gerekiyorsa uyar
  if (await graphifyService.needsRebuild(process.cwd())) {
    injection += '- [BCS Uyarı]: Graphify grafı 6 saatten eski. /bcs-graphify build ile güncelle.\n'
  }

  // Context Mode aktif mi?
  if (await contextModeService.isActive(process.cwd())) {
    injection += '- Context Mode aktif: Tool output\'ları context\'e ham girmez.\n'
  }

  // Model routing direktifi — modele tier kullanımını öğret
  injection += [
    '- Büyük/karmaşık görevler için: /bcs-agent komutunu kullan',
    '- Planlama gerektiren görevler: PLAN tier model kullan',
    '- Kod üretimi: KOD tier model kullan (ucuz + hızlı)',
    '- Doğrulama: REVİEW tier model kullan (en ucuz)',
  ].join('\n')
  injection += '\n<!-- /Better Code Soul -->'

  return system + injection
},
```

---

## GÖREV 5 — SQLite ŞEMASINA EKLENECEKler

```sql
-- Mevcut Database.ts'e şu tabloları EKLE (var olanları silme):

-- Decompose kararları (audit trail)
CREATE TABLE IF NOT EXISTS decompose_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  user_request TEXT NOT NULL,
  task_type TEXT,
  complexity TEXT,
  planner_model TEXT,
  coder_models TEXT,  -- JSON array
  reviewer_model TEXT,
  context_files TEXT, -- JSON array
  estimated_tokens INTEGER,
  estimated_cost REAL,
  estimated_minutes INTEGER,
  reasoning TEXT,     -- JSON array
  warnings TEXT,      -- JSON array
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Orchestration adımları (dashboard'daki agent akış görselleştirmesi için)
CREATE TABLE IF NOT EXISTS orchestration_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orchestration_id INTEGER REFERENCES orchestrations(id),
  step_index INTEGER,
  role TEXT,         -- 'planner' | 'coder_A' | 'coder_B' | 'reviewer_A' ...
  model TEXT,
  task TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  duration_ms INTEGER,
  success INTEGER,
  error TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Model router log (hangi modelin neden seçildiği)
CREATE TABLE IF NOT EXISTS routing_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  tier TEXT,
  selected_model TEXT,
  reason TEXT,
  connected_models TEXT,  -- JSON — o anki bağlı model listesi
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

---

## GÖREV 6 — `/bcs-agent` ÇIKTI GÜNCELLEMESİ

Kullanıcı `/bcs-agent "..."` dediğinde artık şunları göster:

```typescript
// src/tools/bcs_agent.ts — execute metodunu güncelle

execute: async ({ request, strategy, maxCost }) => {
  // 1. Önce decompose kararını göster (kullanıcı ne yapılacağını görür)
  const decision = await orchestrator.decompose(request, process.cwd())
  const decisionMd = taskDecomposer.formatDecision(decision)

  // 2. Maliyet onayı
  const approved = await costGuard.check(decision.estimatedCost)
  if (!approved) return decisionMd + '\n\n❌ İptal edildi (maliyet limiti).'

  // 3. Canlı progress göster
  let progressOutput = decisionMd + '\n\n---\n\n## 🚀 Çalışıyor...\n\n'

  // 4. Orchestrate
  const result = await orchestrator.run(request, process.cwd(), decision)

  // 5. Sonuç
  return progressOutput + `
---

## ✅ Tamamlandı

| | |
|---|---|
| Modeller | ${result.modelsUsed.join(', ')} |
| Paralel agent | ${result.agentCount} |
| Toplam token | ${result.totalTokens.toLocaleString()} |
| Maliyet | $${result.totalCost.toFixed(4)} |
| Süre | ${Math.round(result.durationMs / 1000)} saniye |

${result.hasConflicts ? '⚠ **Dosya çakışmaları var — aşağıyı incele**\n\n' : ''}

${result.output}

---
_Detaylar için: \`/bcs\` → Sekme 3 (AGENTLAR)_
  `
}
```

---

## UYGULAMA SIRASI

```
1. npm install blessed blessed-contrib @types/blessed
   npm run build → hata yoksa devam

2. GÖREV 3: ModelRouter.ts yaz (bağımsız, hiçbir şeye bağlı değil)
   → Tüm servislerde this.modelRegistry.getBestFor() → this.modelRouter.route() ile değiştir

3. GÖREV 5: Database.ts'e yeni tabloları ekle
   → Migration versiyonunu 2'ye çıkar

4. GÖREV 2: TaskDecomposer.ts'i yeniden yaz
   → formatDecision() metodunu test et: npm run test

5. GÖREV 4: GraphifyService.ts'e metodları ekle
   → buildContextSummary() test et (mock graph.json ile)

6. GÖREV 4: systemTransform.ts hook'unu güncelle
   → OpenCode'da test: session aç, /bcs-status çalıştır, system prompt'ta injection var mı?

7. GÖREV 1: Dashboard.ts yaz
   → Önce terminalde `node -e "require('./dist/tui/Dashboard').testRender()"` ile test et
   → Sonra /bcs tool'ına bağla

8. GÖREV 6: bcs_agent.ts çıktısını güncelle

9. npm run build → TypeScript sıfır hata
   better-code-soul setup → yeniden kaydet
   OpenCode restart → /bcs test et
```

---

## KONTROL LİSTESİ — Her Görev Sonrası

```
GÖREV 3 (ModelRouter) sonrası:
  □ /bcs-models çıktısında "Router öncelik sırası" bölümü görünüyor mu?
  □ Bağlı olmayan model seçilince warning log'da görünüyor mu?

GÖREV 2 (TaskDecomposer) sonrası:
  □ /bcs-agent "basit fix" → complexity: simple, planner null
  □ /bcs-agent "auth sistemi yaz" → complexity: complex, 3-4 coder
  □ Decompose kararı SQLite'a yazılıyor mu?

GÖREV 4 (Graphify) sonrası:
  □ graphify-out/graph.json varken session açınca system prompt'ta "Graphify Bağlam Özeti" var mı?
  □ Graf 6 saatten eskiyse uyarı çıkıyor mu?

GÖREV 1 (Dashboard) sonrası:
  □ /bcs → dashboard açılıyor mu?
  □ ESC → kapanıp OpenCode'a dönüyor mu?
  □ Tab [1]-[5] çalışıyor mu?
  □ Tab 4'te [G] Graphify toggle çalışıyor mu?
  □ Tab 2'de model tablosu doğru renklerde mi?
  □ Tab 3'te son /bcs-agent sonucu görünüyor mu?
```

---

