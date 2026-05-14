# MASTER PROMPT — Better Code Soul Plugin
> Bu promptu Claude Code / Cursor / Windsurf'e yapıştır.
> Electron yok. GUI yok. Native OpenCode plugin + paralel subagent orkestrasyon.

---

## PROJE TANIMI

**Better Code Soul**, Opencode CLI için native bir **plugin + MCP server + paralel subagent orkestratörü** paketidir.

Kullanıcı `npm install -g better-code-soul` yapar, bir komut çalıştırır, biter.
Sonrasında her OpenCode session'ında:
- Token ve maliyet takibi otomatik çalışır
- **Paralel subagentlar göreve göre otomatik dağıtılır ve orkestre edilir**
- Graphify hafıza sistemi yönetilebilir
- Context Mode token tasarrufu yönetilebilir
- Model bilgileri ve auth durumu görülebilir
- Her şey OpenCode içindeki özel komutlarla kontrol edilir

Dağıtım: `npm install -g better-code-soul` → tek komut kurulum
Lisans: MIT (tam açık kaynak)
Repo: GitHub'da yayınlanır, GitHub Releases üzerinden zip de sunulur

---

## TEKNİK STACK — DEĞIŞTIRME

```
Runtime:        Node.js 18+ (TypeScript)
Plugin sistemi: OpenCode native plugin API
MCP:            Model Context Protocol (stdio transport)
Subagent:       OpenCode subagent API + MCP tool chaining (paralel orkestrasyon)
Storage:        SQLite (better-sqlite3) — local ~/.better-code-soul/
Config patch:   JSON r/w — opencode.json + AGENTS.md
Process:        Node.js child_process (graphify, context-mode, pip, npm spawn)
Packaging:      npm package → global install
Build:          tsup (ESM + CJS bundle)
Test:           vitest
```

---

## KLASÖR YAPISI

```
better-code-soul/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
│
├── src/
│   ├── index.ts                    # Plugin entry — OpenCode'a register edilir
│   ├── plugin.ts                   # Ana plugin tanımı (hooks + tools)
│   │
│   ├── hooks/
│   │   ├── toolBefore.ts           # tool.execute.before — thinking state
│   │   ├── toolAfter.ts            # tool.execute.after — done/error state
│   │   ├── sessionCompact.ts       # experimental.session.compacting
│   │   └── systemTransform.ts      # experimental.chat.system.transform
│   │
│   ├── subagents/                  # ── Paralel Subagent Sistemi ──
│   │   ├── Orchestrator.ts         # Görevi analiz et, subagentları dağıt, topla
│   │   ├── AgentRunner.ts          # Tek bir subagent'ı spawn + yönet
│   │   ├── TaskDecomposer.ts       # Büyük görevi paralel alt görevlere böl
│   │   ├── ResultMerger.ts         # Paralel sonuçları birleştir + çakışma çöz
│   │   ├── CostGuard.ts            # Subagent başlatmadan önce maliyet kontrolü
│   │   └── agents/
│   │       ├── PlannerAgent.ts     # PLAN tier — mimari, araştırma (1 kez çalışır)
│   │       ├── CoderAgent.ts       # KOD tier — implementasyon (paralel N adet)
│   │       ├── ReviewerAgent.ts    # REVİEW tier — doğrulama, test (paralel N adet)
│   │       └── ResearchAgent.ts    # Araştırma — dokümantasyon, örnekler
│   │
│   ├── tools/                      # OpenCode'a eklenen özel slash komutları
│   │   ├── bcs_status.ts           # /bcs-status — genel durum özeti
│   │   ├── bcs_tokens.ts           # /bcs-tokens — token/cost raporu
│   │   ├── bcs_models.ts           # /bcs-models — auth + model listesi
│   │   ├── bcs_graphify.ts         # /bcs-graphify — graphify yönetimi
│   │   ├── bcs_context_mode.ts     # /bcs-context-mode — context mode yönetimi
│   │   ├── bcs_optimize.ts         # /bcs-optimize — optimizasyon önerileri
│   │   └── bcs_agent.ts            # /bcs-agent — subagent orkestrasyon
│   │
│   ├── services/
│   │   ├── TokenTracker.ts         # Her tool call'dan token parse + SQLite kayıt
│   │   ├── CostCalculator.ts       # Model fiyatlarıyla maliyet hesabı
│   │   ├── ModelRegistry.ts        # Model kataloğu + fiyat veritabanı
│   │   ├── AuthReader.ts           # opencode auth status parse
│   │   ├── GraphifyService.ts      # Graphify kurulum + toggle + stats
│   │   ├── ContextModeService.ts   # Context Mode kurulum + toggle + stats
│   │   ├── ConfigPatcher.ts        # opencode.json + AGENTS.md okuma/yazma
│   │   └── Database.ts             # SQLite bağlantısı + migrasyon
│   │
│   ├── models/
│   │   └── catalog.json            # Varsayılan model veritabanı
│   │
│   └── utils/
│       ├── spawn.ts                # child_process wrapper (stream + promise)
│       ├── platform.ts             # win32/darwin/linux fark yönetimi
│       ├── format.ts               # token/cost/tarih formatlama
│       └── logger.ts               # session log dosyasına yaz
│
├── configs/
│   └── opencode/
│       └── AGENTS.md               # Kullanıcının projesine kopyalanacak
│
└── scripts/
    └── postinstall.js              # npm install sonrası otomatik setup
```

---

## PLUGIN KAYIT — ANA DOSYA

```typescript
// src/index.ts
// OpenCode bu dosyayı import eder. Default export plugin factory olmalı.

import { BetterCodeSoulPlugin } from './plugin'
export default BetterCodeSoulPlugin
export { BetterCodeSoulPlugin }

// opencode.json'da kullanım:
// {
//   "plugin": ["better-code-soul"]
// }
```

```typescript
// src/plugin.ts
import type { OpenCodePlugin } from 'opencode/types' // OpenCode plugin tip tanımı

export const BetterCodeSoulPlugin: OpenCodePlugin = async (app) => {
  // Servisleri başlat
  await db.init()
  await tokenTracker.init()

  return {
    // ── HOOKS ──────────────────────────────────────────────────────

    'tool.execute.before': async (input) => {
      tokenTracker.recordToolStart(input.tool, input.input)
      // Model context dolumunu güncelle
      await db.updateSessionState({ lastTool: input.tool, state: 'thinking' })
    },

    'tool.execute.after': async (input, output) => {
      const tokens = parseTokensFromOutput(output)
      await tokenTracker.recordToolEnd(input.tool, tokens, output)
      await db.saveToolCall({
        tool: input.tool,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        cost: costCalc.calculate(tokens, getCurrentModel()),
        timestamp: Date.now()
      })
    },

    'experimental.session.compacting': async (session) => {
      // Session compact olmadan önce snapshot al
      await db.saveSessionSnapshot(session)
    },

    'experimental.chat.system.transform': async (system) => {
      // Her session başında routing direktiflerini inject et
      const snapshot = await db.getLatestSnapshot()
      const graphifyActive = await graphifyService.isActive()
      const ctxModeActive = await contextModeService.isActive()

      let injection = '\n\n<!-- Better Code Soul -->\n'
      if (graphifyActive) {
        injection += '- Proje bilgi grafiği aktif. Sorgular için /graphify komutunu kullan.\n'
      }
      if (ctxModeActive) {
        injection += '- Context Mode aktif. Ham tool output context\'e girmiyor.\n'
      }
      if (snapshot) {
        injection += `- Önceki session: ${snapshot.summary}\n`
      }

      return system + injection
    },

    'chat.message': async (message) => {
      // Kullanıcı kararlarını ve tercihlerini kaydet
      await db.saveUserMessage(message)
    },

    // ── TOOLS (slash komutları) ────────────────────────────────────

    tools: {
      bcs_status: {
        description: 'Better Code Soul genel durum özeti — token, maliyet, aktif araçlar',
        parameters: {},
        execute: async () => {
          return await hubStatusTool.execute()
        }
      },

      bcs_tokens: {
        description: 'Bu session ve geçmiş kullanım için token + maliyet raporu',
        parameters: {
          period: {
            type: 'string',
            enum: ['session', 'today', 'week', 'month'],
            description: 'Rapor dönemi (varsayılan: session)'
          }
        },
        execute: async ({ period = 'session' }) => {
          return await hubTokensTool.execute(period)
        }
      },

      bcs_models: {
        description: 'Kullanılabilir modeller, auth durumu ve fiyat karşılaştırması',
        parameters: {
          filter: {
            type: 'string',
            enum: ['all', 'connected', 'catalog'],
            description: 'Hangi modeller gösterilsin'
          }
        },
        execute: async ({ filter = 'all' }) => {
          return await hubModelsTool.execute(filter)
        }
      },

      bcs_graphify: {
        description: 'Graphify hafıza sistemi yönetimi — kur, build et, toggle',
        parameters: {
          action: {
            type: 'string',
            enum: ['status', 'install', 'build', 'update', 'enable', 'disable'],
            description: 'Yapılacak işlem'
          }
        },
        execute: async ({ action }) => {
          return await hubGraphifyTool.execute(action)
        }
      },

      bcs_context_mode: {
        description: 'Context Mode token tasarrufu yönetimi — kur, toggle, stats',
        parameters: {
          action: {
            type: 'string',
            enum: ['status', 'install', 'enable', 'disable', 'stats', 'doctor'],
            description: 'Yapılacak işlem'
          }
        },
        execute: async ({ action }) => {
          return await hubContextModeTool.execute(action)
        }
      },

      bcs_optimize: {
        description: 'Mevcut kullanım verilerine göre token optimizasyon önerileri üret',
        parameters: {},
        execute: async () => {
          return await hubOptimizeTool.execute()
        }
      }
    }
  }
}
```

---

## TOOL ÇIKTILARI — FORMATLAMA

Her tool markdown formatında çıktı üretir. OpenCode bunu render eder.

### bcs_status çıktısı
```markdown
## Better Code Soul — Durum

**Bu Session**
- Başlangıç: 14:32 · Süre: 47 dk
- Token: 12.847 giriş / 3.241 çıkış
- Maliyet: $0.0412
- Aktif model: claude-sonnet-4-5 [KOD]

**Token Araçları**
- Graphify: ✅ Aktif (847 düğüm · son build: 2s önce)
- Context Mode: ✅ Aktif (%98 tasarruf · bu session: 315KB → 5.4KB)

**Bağlantılar**
- Anthropic: ✅ OAuth (Claude Pro)
- OpenAI: ✅ API Key
- Google: ❌ Bağlı değil

Detay için: `/bcs-tokens`, `/bcs-models`, `/bcs-graphify`, `/bcs-context-mode`
```

### bcs_tokens çıktısı
```markdown
## Token Raporu — Bu Hafta

| Gün | Token | Maliyet | Model |
|-----|-------|---------|-------|
| Pzt | 45.2K | $0.14  | sonnet-4-5 |
| Sal | 82.1K | $0.31  | opus-4-5 |
| Çar | 31.4K | $0.09  | kimi-k2 |
| Per | 67.8K | $0.20  | sonnet-4-5 |
| Cum | 28.3K | $0.08  | haiku-4-5 |

**Toplam: 254.8K token · $0.82**

**En pahalı model:** claude-opus-4-5 ($0.31)
**Tasarruf (Context Mode ile):** ~$0.24 daha az

Optimizasyon için: `/bcs-optimize`
```

### bcs_models çıktısı
```markdown
## Kullanılabilir Modeller

### 🔗 OAuth ile Bağlı
| Model | Tier | Ctx | Fiyat (giriş/çıkış) |
|-------|------|-----|---------------------|
| claude-opus-4-5 | PLAN | 200K | $15 / $75 |
| claude-sonnet-4-5 | KOD | 200K | $3 / $15 ⬅ aktif |
| claude-haiku-4-5 | REVİEW | 200K | $0.8 / $4 |
| gpt-4o | KOD | 128K | $2.5 / $10 |
| gpt-4o-mini | REVİEW | 128K | $0.15 / $0.60 |

### 📦 Katalog (bağlantı yok)
| Model | Tier | Fiyat | Nasıl Bağlanır |
|-------|------|-------|----------------|
| gemini-2.5-pro | PLAN | $1.25/$10 | opencode auth login google |
| kimi-k2 | KOD | $0.60/$2.5 | API key gerekli |
| deepseek-v3 | KOD | $0.27/$1.10 | API key gerekli |

Model bağlamak için: `opencode auth login <provider>`
```

### bcs_graphify çıktısı
```markdown
## Graphify — Hafıza Sistemi

**Durum:** ✅ Kurulu (v0.6.9)
**Platform:** OpenCode entegrasyonu aktif
**Aktif proje:** ~/projects/myapp

**Graf İstatistikleri**
- Düğüm: 847 · Bağlantı: 2.341
- Dosya: 124 · Boyut: 12.4 MB
- Son build: 3 saat önce

**Token Etkisi**
- Model tüm dosyaları okumak yerine grafiği sorgular
- Tahmini tasarruf (bu proje): ~80.000 token/hafta

---
Kullanım:
- `/bcs-graphify build` → graf oluştur/güncelle
- `/bcs-graphify enable` → bu projede aktifleştir
- `/bcs-graphify disable` → bu projede devre dışı bırak
```

---

## SERVİSLER — DETAYLI

### TokenTracker.ts
```typescript
// src/services/TokenTracker.ts
//
// Her tool.execute.after'da token parse et:
//
// OpenCode log çıktısında şu pattern'leri ara:
//   /tokens?:\s*(\d+)/i
//   /input.*?(\d+).*?token/i
//   /output.*?(\d+).*?token/i
//   /cost:\s*\$?([\d.]+)/i
//   /model:\s*([a-z0-9._-]+)/i
//
// Parse edilemeyen durumlarda: tool tipi bazlı tahmin
//   file_read → ~500 token input
//   bash_exec → ~200 token input + çıktı boyutu / 4
//   web_fetch → ~1000 token input
//
// Her tool call SQLite'a kaydet:
//   CREATE TABLE tool_calls (
//     id INTEGER PRIMARY KEY,
//     session_id TEXT,
//     tool TEXT,
//     input_tokens INTEGER,
//     output_tokens INTEGER,
//     cost_usd REAL,
//     model TEXT,
//     timestamp INTEGER
//   )
```

### AuthReader.ts
```typescript
// src/services/AuthReader.ts
//
// Sırayla şunları dene:
//
// 1. opencode auth status --json komutunu çalıştır
//    → JSON parse et: providers[], each { name, connected, email }
//
// 2. Alternatif: opencode config dosyasını oku
//    Yollar (platform.ts'den):
//      win:   %APPDATA%\opencode\config.json
//      mac:   ~/Library/Application Support/opencode/config.json
//      linux: ~/.config/opencode/config.json
//    → "providers" veya "auth" alanını parse et
//
// 3. Bulunamadıysa: boş liste döndür, kullanıcıya uyar
//
// Döndür: AuthProvider[]
// interface AuthProvider {
//   name: string          // 'anthropic' | 'openai' | 'google' | ...
//   connected: boolean
//   method: 'oauth' | 'apikey' | 'unknown'
//   email?: string
//   plan?: string         // 'pro' | 'plus' | 'free' | unknown
//   models?: string[]     // erişilebilir model ID'leri
// }
```

### GraphifyService.ts
```typescript
// src/services/GraphifyService.ts
//
// Metodlar:
//
// isInstalled(): boolean
//   → `graphify --version` çalıştır, çıkış kodu 0 ise kurulu
//
// isActive(projectPath: string): boolean
//   → AGENTS.md veya .claude/settings.json'da graphify direktifi var mı?
//   → graphify-out/graph.json mevcut mu?
//
// install(): AsyncGenerator<string>
//   → `pip install graphifyy --break-system-packages` stream et
//   → Başarılıysa: `graphify install --platform opencode` çalıştır
//   → Her satırı yield et (çağıran tool canlı gösterir)
//
// build(projectPath: string): AsyncGenerator<string>
//   → `graphify .` komutu, projectPath'te çalıştır
//   → stdout'u yield et
//   → Bitince: graph.json'u parse et, istatistikleri kaydet
//
// enable(projectPath: string): void
//   → `graphify opencode install` çalıştır
//   → AGENTS.md'ye graphify direktifi ekle (yoksa oluştur)
//
// disable(projectPath: string): void
//   → `graphify opencode uninstall` çalıştır
//   → AGENTS.md'den graphify direktifini kaldır
//
// getStats(projectPath: string): GraphifyStats
//   → graphify-out/graph.json parse et
//   → { nodeCount, edgeCount, fileCount, sizeBytes, lastBuilt }
```

### ContextModeService.ts
```typescript
// src/services/ContextModeService.ts
//
// Metodlar:
//
// isInstalled(): boolean
//   → `context-mode --version` veya `npx context-mode --version`
//
// isActive(projectPath: string): boolean
//   → opencode.json'da "plugin": ["context-mode"] var mı?
//   → "mcp"."context-mode" var mı?
//
// install(): AsyncGenerator<string>
//   → `npm install -g context-mode` stream et
//   → Her satırı yield et
//
// enable(projectPath: string): void
//   → opencode.json'u bul (proje kökü veya global ~/.config/opencode/)
//   → Şunu ekle (mevcut içeriği koru, sadece context-mode ekle):
//     {
//       "mcp": { "context-mode": { "type": "local", "command": ["context-mode"] } },
//       "plugin": ["context-mode"]
//     }
//   → AGENTS.md'ye context-mode direktifini kopyala
//     (src: node_modules/context-mode/configs/opencode/AGENTS.md)
//
// disable(projectPath: string): void
//   → opencode.json'dan context-mode mcp + plugin girişini kaldır
//   → AGENTS.md'den context-mode direktifini temizle
//
// getStats(): ContextModeStats
//   → `context-mode statusline` çalıştır
//   → Parse et: "$X.XX saved · $Y.YY total · Z% efficient"
//   → { savedThisSession, savedTotal, efficiencyPercent }
//
// runDoctor(): string
//   → `context-mode doctor` çalıştır, çıktıyı döndür
```

### ConfigPatcher.ts
```typescript
// src/services/ConfigPatcher.ts
//
// opencode.json okuma/yazma:
//
// findOpencodeJson(projectPath: string): string | null
//   → Önce proje kökünde ara
//   → Yoksa global config yolunda ara
//
// patchOpencodeJson(filePath: string, patch: object): void
//   → Mevcut JSON'u oku
//   → Deep merge ile patch uygula
//   → Yaz (2-space indent, UTF-8)
//   → Orijinal format bozulmamalı (comments varsa koru)
//
// findAgentsMd(projectPath: string): string
//   → Proje kökünde AGENTS.md ara
//   → Yoksa oluştur
//
// appendToAgentsMd(filePath: string, section: string, content: string): void
//   → section başlığı altında content var mı kontrol et
//   → Yoksa sonuna ekle
//   → Varsa güncelle
//
// removeFromAgentsMd(filePath: string, section: string): void
//   → İlgili section'ı bul ve kaldır
```

---

## MODEL KATALOĞU

```json
// src/models/catalog.json
// Bu dosya her session'da yüklenir.
// Kullanıcı yeni model ekleyince ~/.better-code-soul/models.json'a yazılır.
// Plugin catalog.json + kullanıcı modellerini merge eder.

{
  "version": "1.0",
  "updated": "2026-05",
  "models": [
    {
      "id": "claude-opus-4-5",
      "name": "Claude Opus 4.5",
      "provider": "anthropic",
      "tier": "think",
      "contextWindow": 200000,
      "inputPrice": 15.00,
      "outputPrice": 75.00,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "claude-sonnet-4-5",
      "name": "Claude Sonnet 4.5",
      "provider": "anthropic",
      "tier": "code",
      "contextWindow": 200000,
      "inputPrice": 3.00,
      "outputPrice": 15.00,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "claude-haiku-4-5",
      "name": "Claude Haiku 4.5",
      "provider": "anthropic",
      "tier": "review",
      "contextWindow": 200000,
      "inputPrice": 0.80,
      "outputPrice": 4.00,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "provider": "openai",
      "tier": "code",
      "contextWindow": 128000,
      "inputPrice": 2.50,
      "outputPrice": 10.00,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "gpt-4o-mini",
      "name": "GPT-4o Mini",
      "provider": "openai",
      "tier": "review",
      "contextWindow": 128000,
      "inputPrice": 0.15,
      "outputPrice": 0.60,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "o3",
      "name": "o3",
      "provider": "openai",
      "tier": "think",
      "contextWindow": 200000,
      "inputPrice": 10.00,
      "outputPrice": 40.00,
      "authMethod": ["apikey"]
    },
    {
      "id": "gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "provider": "google",
      "tier": "think",
      "contextWindow": 1000000,
      "inputPrice": 1.25,
      "outputPrice": 10.00,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "provider": "google",
      "tier": "code",
      "contextWindow": 1000000,
      "inputPrice": 0.30,
      "outputPrice": 2.50,
      "authMethod": ["oauth", "apikey"]
    },
    {
      "id": "glm-4-plus",
      "name": "GLM-4 Plus",
      "provider": "zhipu",
      "tier": "code",
      "contextWindow": 128000,
      "inputPrice": 0.70,
      "outputPrice": 0.70,
      "authMethod": ["apikey"]
    },
    {
      "id": "kimi-k2",
      "name": "Kimi K2",
      "provider": "moonshot",
      "tier": "code",
      "contextWindow": 131072,
      "inputPrice": 0.60,
      "outputPrice": 2.50,
      "authMethod": ["apikey"]
    },
    {
      "id": "deepseek-v3",
      "name": "DeepSeek V3",
      "provider": "deepseek",
      "tier": "code",
      "contextWindow": 64000,
      "inputPrice": 0.27,
      "outputPrice": 1.10,
      "authMethod": ["apikey"]
    },
    {
      "id": "minimax-text-01",
      "name": "MiniMax Text-01",
      "provider": "minimax",
      "tier": "review",
      "contextWindow": 245760,
      "inputPrice": 0.20,
      "outputPrice": 1.10,
      "authMethod": ["apikey"]
    }
  ]
}
```

---

---

## PARALEl SUBAGENT SİSTEMİ — DETAYLI MİMARİ

Bu, Better Code Soul'un en kritik özelliğidir. Büyük ve karmaşık görevleri küçük alt görevlere bölerek **farklı modellere eş zamanlı** dağıtır. Sonuçları birleştirir. Tek model tek seferde çalışmak yerine, doğru modeller doğru işleri paralel yapar.

### Neden Paralel Subagent?

```
Geleneksel yaklaşım (kötü):
  Kullanıcı: "Kullanıcı profil sayfası ekle"
  → Tek model (Opus, $15/1M) tüm işi yapar
  → Planlama + kod + test + review = tek context, sırayla
  → Süre: 15 dakika · Maliyet: $0.45

Better Code Soul yaklaşımı (iyi):
  Kullanıcı: "Kullanıcı profil sayfası ekle"
  → Orchestrator görevi analiz eder
  → PlannerAgent (Gemini Pro, $1.25/1M) → mimari plan → 2 dk
  → Paralel başlar:
       CoderAgent A (Kimi K2, $0.60/1M) → ProfileCard component → 3 dk
       CoderAgent B (Kimi K2, $0.60/1M) → API endpoint → 3 dk
       CoderAgent C (DeepSeek V3, $0.27/1M) → DB migration → 3 dk
  → ReviewerAgent (Haiku, $0.80/1M) → hepsini kontrol → 1 dk
  → ResultMerger → birleştir + çakışma çöz
  → Süre: 4 dakika (paralel) · Maliyet: $0.06

Tasarruf: %87 maliyet, %73 süre
```

---

### Orchestrator.ts — Ana Yönetici

```typescript
// src/subagents/Orchestrator.ts

export class Orchestrator {
  // Kullanıcının isteğini alır, tüm akışı yönetir.
  async run(userRequest: string, projectPath: string): Promise<OrchestrationResult> {

    // 1. GÖREV DEKOMPOZİSYONU
    const plan = await this.taskDecomposer.decompose(userRequest, {
      projectPath,
      contextFiles: await this.getContextFiles(projectPath),
      availableModels: await authReader.getConnectedModels(),
    })

    // plan şöyle görünür:
    // {
    //   plannerTask: "Mimari kararları ver, hangi dosyalar değişecek belirle",
    //   coderTasks: [
    //     { id: 'A', task: "ProfileCard React component yaz", files: ['src/components/ProfileCard.tsx'] },
    //     { id: 'B', task: "GET /api/users/:id endpoint ekle", files: ['src/api/users.ts'] },
    //     { id: 'C', task: "users tablosuna bio kolonu ekle", files: ['migrations/002_add_bio.sql'] },
    //   ],
    //   reviewTask: "3 parçanın tip uyumunu ve API kontratını doğrula",
    //   estimatedCost: 0.06,
    //   estimatedMinutes: 4,
    // }

    // 2. MALİYET KONTROLÜ (kullanıcıya sor)
    const approved = await costGuard.check(plan.estimatedCost)
    if (!approved) return { cancelled: true, reason: 'Kullanıcı maliyet onayı vermedi' }

    // 3. PLANLAMA AŞAMASI (1 adet, pahalı model, tek seferlik)
    const planResult = await this.agentRunner.run({
      agentType: 'planner',
      model: modelRegistry.getBestFor('think'),   // gemini-2.5-pro veya opus
      task: plan.plannerTask,
      context: await this.buildMinimalContext(projectPath, ['RULES.md', 'SPEC.md']),
      maxTokens: 4000,
    })

    // 4. KOD ÜRETIM AŞAMASI (paralel, ucuz modeller)
    const coderResults = await Promise.allSettled(
      plan.coderTasks.map(task =>
        this.agentRunner.run({
          agentType: 'coder',
          model: modelRegistry.getBestFor('code'),   // kimi-k2 veya deepseek-v3
          task: task.task,
          context: [
            planResult.output,                        // planlama çıktısı her coder'a gider
            await this.readFiles(task.files),          // sadece ilgili dosyalar
            await this.readFile('RULES.md'),           // kod kuralları
          ].join('\n\n'),
          outputFiles: task.files,
          maxTokens: 3000,
        })
      )
    )

    // 5. DOĞRULAMA AŞAMASI (paralel, en ucuz model)
    const reviewResults = await Promise.allSettled(
      coderResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .map(coderResult =>
          this.agentRunner.run({
            agentType: 'reviewer',
            model: modelRegistry.getBestFor('review'),   // haiku veya gpt-4o-mini
            task: `Bu kodu incele: tip hatası, logic hatası, RULES.md ihlali var mı?\n\n${coderResult.output}`,
            context: coderResult.output,
            maxTokens: 1000,
          })
        )
    )

    // 6. SONUÇLARI BİRLEŞTİR
    const merged = await this.resultMerger.merge({
      planResult,
      coderResults: coderResults.filter(r => r.status === 'fulfilled').map(r => r.value),
      reviewResults: reviewResults.filter(r => r.status === 'fulfilled').map(r => r.value),
    })

    // 7. TOKEN/MALİYET KAYDET
    await db.saveOrchestration({
      userRequest,
      agentCount: plan.coderTasks.length + 2,
      totalTokens: merged.totalTokens,
      totalCost: merged.totalCost,
      durationMs: merged.durationMs,
      modelsUsed: merged.modelsUsed,
    })

    return merged
  }
}
```

---

### TaskDecomposer.ts — Görevi Parçalara Böl

```typescript
// src/subagents/TaskDecomposer.ts
//
// Kullanıcının isteğini analiz edip paralel çalıştırılabilir alt görevlere böler.
// Bu adım HİÇBİR model çağrısı yapmaz — kural tabanlı heuristik kullanır.
// (Model çağrısı = token = maliyet, bu yüzden decompose ücretsiz olmalı)

export class TaskDecomposer {

  // Görev tipini tespit et
  detectTaskType(request: string): TaskType {
    const patterns = {
      feature:   /ekle|implement|yaz|oluştur|create|add|build/i,
      fix:       /düzelt|fix|hata|bug|broken|çalışmıyor/i,
      refactor:  /refactor|temizle|yeniden yaz|clean|reorganize/i,
      review:    /incele|review|kontrol|check|analiz/i,
      research:  /araştır|nedir|nasıl|ne zaman|research|explain/i,
    }
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(request)) return type as TaskType
    }
    return 'feature'  // varsayılan
  }

  // Hangi dosyalar etkilenebilir?
  async inferAffectedFiles(request: string, projectPath: string): Promise<string[]> {
    // Basit keyword → dizin eşlemesi:
    const hints: Record<string, string[]> = {
      'component|ui|ekran|sayfa':  ['src/components/', 'src/pages/'],
      'api|endpoint|route':        ['src/api/', 'src/routes/', 'src/handlers/'],
      'db|database|migration|tablo': ['migrations/', 'src/db/', 'prisma/'],
      'test|spec':                 ['tests/', '__tests__/', 'src/__tests__/'],
      'auth|login|jwt':            ['src/auth/', 'src/middleware/'],
      'style|css|tailwind':        ['src/styles/', 'src/components/'],
    }

    const matchedDirs: string[] = []
    for (const [pattern, dirs] of Object.entries(hints)) {
      if (new RegExp(pattern, 'i').test(request)) {
        matchedDirs.push(...dirs)
      }
    }

    // Var olan dizinleri filtrele
    return matchedDirs.filter(dir => fs.existsSync(path.join(projectPath, dir)))
  }

  // Ana decompose metodu
  async decompose(request: string, ctx: DecomposeContext): Promise<TaskPlan> {
    const taskType = this.detectTaskType(request)
    const affectedDirs = await this.inferAffectedFiles(request, ctx.projectPath)

    // Görev tipine göre strateji seç:
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
    }
  }

  private decomposeFeature(request: string, dirs: string[], ctx: DecomposeContext): TaskPlan {
    // Feature için standart 3-aşama plan:
    // Planner (1) → Coders (N, paralel) → Reviewers (N, paralel)

    // Kaç paralel coder olacak? affected dizin sayısına göre
    const coderCount = Math.min(dirs.length || 1, 4)  // maksimum 4 paralel

    return {
      strategy: 'plan-code-review',
      plannerTask: `"${request}" için mimari plan yap.
        Hangi dosyalar oluşturulacak/değiştirilecek listele.
        Her dosya için 1-2 cümle açıklama yaz.
        Sadece plan yap, kod yazma.`,

      coderTasks: dirs.slice(0, coderCount).map((dir, i) => ({
        id: String.fromCharCode(65 + i),  // A, B, C, D
        task: `${request} — ${dir} dizinindeki kısmı implement et`,
        directory: dir,
        files: [],  // PlannerAgent çıktısından doldurulur
      })),

      reviewTask: `Tüm parçaların tip uyumunu, API kontratını ve RULES.md'ye uygunluğunu doğrula`,

      estimatedCost: this.estimateCost(1, coderCount, coderCount, ctx.availableModels),
      estimatedMinutes: this.estimateTime(coderCount),
    }
  }

  private estimateCost(planners: number, coders: number, reviewers: number, models: Model[]): number {
    const planModel = models.find(m => m.tier === 'think') || { inputPrice: 1.25, outputPrice: 10 }
    const codeModel = models.find(m => m.tier === 'code') || { inputPrice: 0.60, outputPrice: 2.5 }
    const reviewModel = models.find(m => m.tier === 'review') || { inputPrice: 0.80, outputPrice: 4 }

    const AVG_TOKENS = { plan: [3000, 2000], code: [4000, 2000], review: [2000, 800] }

    return (
      planners * (AVG_TOKENS.plan[0]/1e6 * planModel.inputPrice + AVG_TOKENS.plan[1]/1e6 * planModel.outputPrice) +
      coders * (AVG_TOKENS.code[0]/1e6 * codeModel.inputPrice + AVG_TOKENS.code[1]/1e6 * codeModel.outputPrice) +
      reviewers * (AVG_TOKENS.review[0]/1e6 * reviewModel.inputPrice + AVG_TOKENS.review[1]/1e6 * reviewModel.outputPrice)
    )
  }

  private estimateTime(coderCount: number): number {
    // Paralel çalıştığı için toplam süre = en uzun coder süresi + plan + review
    return 2 + 3 + 1  // plan(2dk) + kod(3dk, paralel) + review(1dk)
  }
}
```

---

### AgentRunner.ts — Subagent Çalıştırıcı

```typescript
// src/subagents/AgentRunner.ts
//
// OpenCode'un subagent API'sini kullanarak tek bir agent'ı çalıştırır.
// OpenCode'un kendi subagent mekanizması varsa onu kullan.
// Yoksa: opencode CLI'ı --model flag'iyle spawn et ve stdout'u parse et.

export class AgentRunner {

  async run(config: AgentConfig): Promise<AgentResult> {
    const startTime = Date.now()

    // OpenCode subagent API (varsa):
    if (this.supportsNativeSubagent()) {
      return this.runNative(config)
    }

    // Fallback: opencode CLI spawn
    return this.runViaCLI(config)
  }

  private async runNative(config: AgentConfig): Promise<AgentResult> {
    // OpenCode'un plugin API'sindeki subagent metodu:
    // app.runSubagent({ model, prompt, context, maxTokens })
    // Bu metot OpenCode'un kendi session yönetimini kullanır.
    const result = await this.app.runSubagent({
      model: config.model.id,
      prompt: this.buildPrompt(config),
      maxTokens: config.maxTokens,
    })

    return {
      agentId: config.agentType + '_' + Date.now(),
      output: result.text,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      model: config.model.id,
      durationMs: Date.now() - startTime,
      success: true,
    }
  }

  private async runViaCLI(config: AgentConfig): Promise<AgentResult> {
    // Prompt'u geçici dosyaya yaz (shell injection önlemi)
    const promptFile = path.join(os.tmpdir(), `bcs-agent-${Date.now()}.txt`)
    await fs.writeFile(promptFile, this.buildPrompt(config), 'utf-8')

    const { stdout, stderr, exitCode } = await spawn('opencode', [
      '--model', config.model.id,
      '--no-interactive',
      '--prompt-file', promptFile,
      '--max-tokens', String(config.maxTokens),
      '--output', 'json',   // JSON parse için
    ])

    await fs.unlink(promptFile)  // temizle

    if (exitCode !== 0) {
      return { success: false, error: stderr, agentId: '', output: '', inputTokens: 0, outputTokens: 0, model: config.model.id, durationMs: Date.now() - startTime }
    }

    const parsed = JSON.parse(stdout)
    return {
      agentId: config.agentType + '_' + Date.now(),
      output: parsed.text || parsed.content,
      inputTokens: parsed.usage?.input_tokens || 0,
      outputTokens: parsed.usage?.output_tokens || 0,
      model: config.model.id,
      durationMs: Date.now() - startTime,
      success: true,
    }
  }

  private buildPrompt(config: AgentConfig): string {
    const rolePrompts = {
      planner: 'Sen bir yazılım mimarısın. Sadece plan yap, KESİNLİKLE kod yazma.',
      coder: 'Sen bir senior developer\'sın. Verilen görevi implement et. Sadece istenen dosyalar.',
      reviewer: 'Sen bir code reviewer\'sın. Kısa ve net ol. Sorun varsa belirt, yoksa "ONAYLANDI" yaz.',
      researcher: 'Sen bir teknik araştırmacısın. Dokümantasyon ve örneklerden kaynak göster.',
    }

    return [
      `ROL: ${rolePrompts[config.agentType]}`,
      '',
      config.context ? `BAĞLAM:\n${config.context}` : '',
      '',
      `GÖREV:\n${config.task}`,
      '',
      'KESİNLİKLE UYULMASI GEREKEN: İlk seferde çalışan çıktı üret. Emin değilsen eksik bırak, tahmin yürütme.',
    ].filter(Boolean).join('\n')
  }
}
```

---

### ResultMerger.ts — Sonuçları Birleştir

```typescript
// src/subagents/ResultMerger.ts
//
// Paralel agent çıktılarını birleştirir.
// Çakışmaları tespit eder ve çözer.

export class ResultMerger {

  async merge(results: MergeInput): Promise<MergedResult> {
    const output: string[] = []

    // Plan özeti
    output.push('## Mimari Plan\n' + results.planResult.output)
    output.push('---')

    // Her coder sonucu
    results.coderResults.forEach((r, i) => {
      output.push(`## Implementasyon ${String.fromCharCode(65 + i)}\n${r.output}`)
    })
    output.push('---')

    // Review sonuçları
    const issues = results.reviewResults
      .map(r => r.output)
      .filter(out => !out.includes('ONAYLANDI'))

    if (issues.length > 0) {
      output.push('## ⚠ Review Bulguları\n' + issues.join('\n\n'))
    } else {
      output.push('## ✅ Tüm Parçalar Onaylandı')
    }

    // Çakışma tespiti: aynı dosyaya birden fazla coder yazmışsa uyar
    const fileConflicts = this.detectFileConflicts(results.coderResults)
    if (fileConflicts.length > 0) {
      output.push('## ⚠ Dosya Çakışmaları\n' + fileConflicts.map(f =>
        `${f.file}: ${f.agents.join(', ')} aynı dosyaya yazdı → manuel birleştir`
      ).join('\n'))
    }

    return {
      output: output.join('\n\n'),
      totalTokens: [results.planResult, ...results.coderResults, ...results.reviewResults]
        .reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
      totalCost: this.calculateTotalCost(results),
      durationMs: Math.max(...results.coderResults.map(r => r.durationMs)) + results.planResult.durationMs,
      modelsUsed: [...new Set([results.planResult.model, ...results.coderResults.map(r => r.model)])],
      hasConflicts: fileConflicts.length > 0,
      issues,
    }
  }

  private detectFileConflicts(coderResults: AgentResult[]): FileConflict[] {
    // Her coder'ın çıktısında hangi dosyalara yazdığını parse et
    // "```typescript // src/..." veya "// src/..." pattern'leriyle
    const fileMap = new Map<string, string[]>()

    coderResults.forEach(result => {
      const fileMatches = result.output.match(/\/\/\s*(src\/[^\s]+|migrations\/[^\s]+)/g) || []
      fileMatches.forEach(match => {
        const file = match.replace('//', '').trim()
        if (!fileMap.has(file)) fileMap.set(file, [])
        fileMap.get(file)!.push(result.agentId)
      })
    })

    return [...fileMap.entries()]
      .filter(([, agents]) => agents.length > 1)
      .map(([file, agents]) => ({ file, agents }))
  }
}
```

---

### CostGuard.ts — Maliyet Kontrolü

```typescript
// src/subagents/CostGuard.ts
//
// Subagent koşturmadan önce tahmini maliyeti gösterir ve onay alır.
// Kullanıcı ayarlarındaki limitlerle karşılaştırır.

export class CostGuard {

  async check(estimatedCost: number): Promise<boolean> {
    const settings = await db.getSettings()
    const todaySpent = await db.getTodayCost()
    const remaining = settings.dailyLimit - todaySpent

    // Otomatik onay koşulları (kullanıcıya sormadan geç):
    if (estimatedCost < 0.01) return true  // $0.01 altı → sormaya değmez
    if (estimatedCost < settings.autoApproveLimit) return true  // kullanıcı belirlemiş

    // Günlük limit aşılacaksa engelle:
    if (estimatedCost > remaining) {
      console.log(`
⛔ Better Code Soul — Günlük Limit

Bu orchestration için tahmini maliyet: $${estimatedCost.toFixed(4)}
Bugün kalan bütçe: $${remaining.toFixed(2)}

Limit aşılacak. İptal edildi.
Limiti değiştirmek için: /bcs-status → Ayarlar
      `)
      return false
    }

    // Kullanıcıya sor (OpenCode içinde):
    // OpenCode'un kendi onay mekanizması varsa onu kullan
    // Yoksa: konsola yaz ve devam et (non-interactive)
    console.log(`
📊 Better Code Soul — Subagent Planı

Strateji: Planlama → Paralel Kod → Paralel Review
Tahmini maliyet: $${estimatedCost.toFixed(4)}
Tahmini süre: ~4 dakika

Devam etmek için Enter'a bas veya Ctrl+C ile iptal et.
    `)

    // Interactive modda kullanıcı onayı bekle:
    return new Promise(resolve => {
      process.stdin.once('data', () => resolve(true))
      setTimeout(() => resolve(true), 5000)  // 5sn cevap yoksa devam et
    })
  }
}
```

---

### /bcs-agent Tool — Kullanıcı Arayüzü

```typescript
// src/tools/bcs_agent.ts
// OpenCode'da /bcs-agent komutuyla çağrılır.

tools: {
  bcs_agent: {
    description: 'Görevi paralel subagentlara dağıt. Büyük feature veya refactor için kullan.',
    parameters: {
      request: {
        type: 'string',
        description: 'Ne yapılmasını istiyorsun? (Türkçe veya İngilizce)',
      },
      strategy: {
        type: 'string',
        enum: ['auto', 'plan-code-review', 'parallel-code', 'sequential'],
        description: 'Orkestrasyon stratejisi (varsayılan: auto)',
      },
      maxCost: {
        type: 'number',
        description: 'Maksimum harcama limiti $ cinsinden (varsayılan: ayardaki günlük limit)',
      },
    },
    execute: async ({ request, strategy = 'auto', maxCost }) => {
      const result = await orchestrator.run(request, process.cwd(), { strategy, maxCost })

      if (result.cancelled) {
        return `❌ İptal: ${result.reason}`
      }

      return `
## ✅ Better Code Soul — Orkestrasyon Tamamlandı

**Kullanılan modeller:** ${result.modelsUsed.join(', ')}
**Paralel agent sayısı:** ${result.agentCount}
**Toplam token:** ${result.totalTokens.toLocaleString()}
**Toplam maliyet:** $${result.totalCost.toFixed(4)}
**Süre:** ${(result.durationMs / 1000).toFixed(0)} saniye

${result.hasConflicts ? '⚠ Dosya çakışmaları var — aşağıyı incele.' : ''}

---

${result.output}
      `
    }
  }
}
```

---

### /bcs-agent Çıktı Örneği

```
Kullanıcı: /bcs-agent "kullanıcı profil sayfası ekle"

📊 Better Code Soul — Subagent Planı
Strateji: Planlama (1) → Paralel Kod (3) → Paralel Review (3)
Tahmini maliyet: $0.0612
Tahmini süre: ~4 dakika

[████████░░] Planlama... (gemini-2.5-pro)
[████████░░] Paralel kod üretimi...
  [A] ProfileCard component (kimi-k2) ████████████ ✓
  [B] /api/users/:id endpoint (kimi-k2) ███████████ ✓
  [C] DB migration (deepseek-v3) ██████████████ ✓
[████████░░] Paralel review... (claude-haiku-4-5)

✅ Better Code Soul — Orkestrasyon Tamamlandı
Kullanılan modeller: gemini-2.5-pro, kimi-k2, deepseek-v3, claude-haiku-4-5
Paralel agent sayısı: 5
Toplam token: 18.432
Toplam maliyet: $0.0589
Süre: 4 saniye
```

---

### Model Seçim Stratejisi — Tier → Model Eşlemesi

```typescript
// src/services/ModelRegistry.ts içinde:

getBestFor(tier: 'think' | 'code' | 'review'): Model {
  // Öncelik sırası:
  // 1. Kullanıcının opencode'da aktif model ayarı (aynı tier'deyse)
  // 2. OAuth bağlı modeller (ücretsiz kullanım)
  // 3. API key olan modeller (en ucuz olanı tier içinde)
  // 4. Katalog'dan öneri (bağlantı yoksa uyar)

  const connected = authReader.getConnected()  // OAuth + API key olanlar
  const candidates = connected.filter(m => m.tier === tier)

  if (candidates.length === 0) {
    // Bağlı model yok, kataloğu kullan ama uyar
    logger.warn(`${tier} tier için bağlı model yok. Katalog kullanılıyor.`)
    return catalog.filter(m => m.tier === tier)[0]
  }

  // En ucuz bağlı modeli seç (tier içinde)
  return candidates.sort((a, b) => a.inputPrice - b.inputPrice)[0]
}
```

---

## OPTIMIZASYON ÖNERİLERİ MOTORU

```typescript
// src/tools/bcs_optimize.ts
//
// Geçmiş kullanımı analiz et ve markdown rapor üret.
// Şu kuralları uygula (öncelik sırasıyla):

const rules = [
  {
    id: 'think_overuse',
    check: (stats) => stats.thinkTierRatio > 0.6,
    message: (stats) => `PLAN tier kullanım oranın %${Math.round(stats.thinkTierRatio*100)}.
      Kod üretimi için sonnet-4-5 veya kimi-k2 yeterli.
      Tahmini tasarruf: $${(stats.thinkCost * 0.7).toFixed(2)}/hafta`
  },
  {
    id: 'no_review_tier',
    check: (stats) => stats.reviewTierUsage === 0,
    message: () => `REVİEW tier hiç kullanılmamış.
      Doğrulama ve küçük fix'ler için haiku-4-5 veya gpt-4o-mini ekle.
      %70 maliyet azalması mümkün.`
  },
  {
    id: 'low_context_fill',
    check: (stats) => stats.avgContextFill < 0.2,
    message: () => `Ortalama context dolumu %${Math.round(stats.avgContextFill*100)}.
      Gereksiz dosyalar context'e ekleniyor olabilir.
      RULES.md + SPEC.md yeterli olduğunda diğer dosyaları çıkar.`
  },
  {
    id: 'high_session_cost',
    check: (stats) => stats.avgSessionCost > 0.5,
    message: (stats) => `Ortalama session maliyeti $${stats.avgSessionCost.toFixed(2)}.
      Görevleri daha küçük parçalara böl.
      Her session tek bir konuya odaklanmalı.`
  },
  {
    id: 'graphify_not_active',
    check: (stats) => !stats.graphifyActive && stats.projectFileCount > 30,
    message: () => `Projede 30'dan fazla dosya var ama Graphify aktif değil.
      Model her seferinde dosyaları okumak yerine grafiği sorgular.
      Kur: /bcs-graphify install`
  },
  {
    id: 'context_mode_not_active',
    check: (stats) => !stats.contextModeActive,
    message: () => `Context Mode aktif değil.
      Tool çıktıları context'e ham olarak giriyor.
      Aktifleştir: /bcs-context-mode enable
      Beklenen tasarruf: %98 tool output azalması`
  },
  {
    id: 'mixed_providers',
    check: (stats) => stats.providerCount > 2,
    message: () => `Birden fazla provider kullanılıyor. Bu iyi.
      Tier-model eşlemeni optimize et:
      PLAN → gemini-2.5-pro (uygun fiyatlı, 1M ctx)
      KOD  → kimi-k2 veya deepseek-v3 (çok ucuz)
      REVİEW → gpt-4o-mini veya haiku-4-5`
  }
]
```

---

## KURULUM AKIŞI

### postinstall.js (npm install sonrası otomatik)
```javascript
// scripts/postinstall.js
// Node.js ile çalışır, bağımlılık gerektirmez.
//
// 1. Global opencode.json yolunu bul
// 2. "plugin" listesine "better-code-soul" ekle (yoksa)
// 3. ~/.better-code-soul/ klasörünü oluştur
// 4. SQLite veritabanını başlat (migrasyon)
// 5. Kullanıcıya bilgi ver:
//    "✅ Better Code Soul kuruldu.
//     OpenCode'u yeniden başlat. /bcs-status ile kontrol et."
```

### Manuel Kurulum (README'de açıkla)
```bash
# 1. Kur
npm install -g better-code-soul

# 2. OpenCode'a register et (postinstall otomatik yapar, ama elle de yapılabilir)
better-code-soul setup

# 3. OpenCode'u başlat
opencode

# 4. Kontrol et
/bcs-status

# Graphify kur (opsiyonel)
/bcs-graphify install

# Context Mode kur (opsiyonel)
/bcs-context-mode install
/bcs-context-mode enable
```

---

## PLATFORM FARKLILIKLARI

```typescript
// src/utils/platform.ts

export const paths = {
  opencodeConfig: () => {
    switch (process.platform) {
      case 'win32':  return path.join(process.env.APPDATA!, 'opencode', 'opencode.json')
      case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support', 'opencode', 'opencode.json')
      default:       return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
    }
  },

  hubData: () => path.join(os.homedir(), '.better-code-soul'),
  hubDb:   () => path.join(paths.hubData(), 'data.db'),
  hubLogs: () => path.join(paths.hubData(), 'logs'),

  python: () => process.platform === 'win32' ? 'python' : 'python3',
  pip:    () => process.platform === 'win32' ? 'pip' : 'pip3',
}
```

---

## GÜVENLİK

```typescript
// API key'ler bu plugin'de SAKLANMAZ.
// Plugin sadece opencode'un kendi auth sistemini okur (read-only).
// Hassas bilgi asla loglanmaz, asla yazılmaz.
//
// opencode.json yazarken:
// - Sadece plugin/mcp alanlarına dokunulur
// - Mevcut auth/key alanlarına asla dokunulmaz
// - Yazma öncesi backup alınır: opencode.json.bak
//
// SQLite'ta saklanan:
// - tool call istatistikleri (anonim)
// - session zamanları
// - token sayıları
// - maliyet tahminleri
// Saklanan: Asla API key, asla prompt içeriği, asla kullanıcı kodu
```

---

## PACKAGE.JSON

```json
{
  "name": "better-code-soul",
  "version": "0.1.0",
  "description": "OpenCode için token takibi, maliyet analizi, Graphify ve Context Mode yönetimi",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "bin": {
    "better-code-soul": "dist/cli.js"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest",
    "postinstall": "node scripts/postinstall.js"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsup": "^8.0.0",
    "vitest": "^1.0.0",
    "@types/better-sqlite3": "*",
    "@types/node": "*"
  },
  "engines": { "node": ">=18" },
  "keywords": ["opencode", "plugin", "token", "mcp", "ai", "graphify", "context-mode"],
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/YOUR_USERNAME/better-code-soul" }
}
```

---

## TSUP KONFİGÜRASYONU

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'node18',
    external: ['better-sqlite3'],
  }
])
```

---

## GELİŞTİRME SIRASI — BUNU TAKİP ET

```
Faz 1 — Temel Yapı:
  [ ] package.json + tsconfig + tsup config
  [ ] src/utils/platform.ts (yol hesaplamaları)
  [ ] src/utils/spawn.ts (child_process wrapper)
  [ ] src/services/Database.ts (SQLite init + migrasyon)
  [ ] scripts/postinstall.js
  [ ] İlk build: `npm run build` çalışmalı

Faz 2 — Servisler:
  [ ] src/services/TokenTracker.ts
  [ ] src/services/CostCalculator.ts
  [ ] src/services/ModelRegistry.ts (catalog.json yükle + merge + getBestFor)
  [ ] src/services/AuthReader.ts (opencode auth status parse)
  [ ] src/services/ConfigPatcher.ts (opencode.json + AGENTS.md r/w)
  [ ] src/services/GraphifyService.ts
  [ ] src/services/ContextModeService.ts

Faz 3 — Plugin ve Hook'lar:
  [ ] src/hooks/toolBefore.ts
  [ ] src/hooks/toolAfter.ts (token parse burada)
  [ ] src/hooks/sessionCompact.ts
  [ ] src/hooks/systemTransform.ts
  [ ] src/plugin.ts (hepsini bir araya getir)
  [ ] src/index.ts (export)

Faz 4 — Paralel Subagent Sistemi:
  [ ] src/subagents/CostGuard.ts (maliyet kontrolü + onay)
  [ ] src/subagents/AgentRunner.ts (native + CLI fallback)
  [ ] src/subagents/TaskDecomposer.ts (kural tabanlı, model çağrısı yok)
  [ ] src/subagents/ResultMerger.ts (birleştir + çakışma tespit)
  [ ] src/subagents/agents/PlannerAgent.ts
  [ ] src/subagents/agents/CoderAgent.ts
  [ ] src/subagents/agents/ReviewerAgent.ts
  [ ] src/subagents/agents/ResearchAgent.ts
  [ ] src/subagents/Orchestrator.ts (hepsini bir araya getir)

Faz 5 — Tool'lar (slash komutları):
  [ ] src/tools/bcs_status.ts
  [ ] src/tools/bcs_tokens.ts
  [ ] src/tools/bcs_models.ts
  [ ] src/tools/bcs_graphify.ts (stream çıktı)
  [ ] src/tools/bcs_context_mode.ts (stream çıktı)
  [ ] src/tools/bcs_optimize.ts (kural motoru)
  [ ] src/tools/bcs_agent.ts (orchestrator'ı çağırır)  ← subagent arayüzü

Faz 6 — CLI ve Kurulum:
  [ ] src/cli.ts (`better-code-soul setup` komutu)
  [ ] configs/opencode/AGENTS.md
  [ ] README.md (kurulum + kullanım + örnekler)
  [ ] GitHub Actions: npm publish + GitHub Release
  [ ] Test: npm install -g . ile lokal test

Faz 7 — Test:
  [ ] AuthReader unit test (mock opencode output)
  [ ] TokenTracker unit test (parse pattern'leri)
  [ ] ConfigPatcher unit test (JSON merge)
  [ ] GraphifyService unit test (mock spawn)
  [ ] ContextModeService unit test
  [ ] TaskDecomposer unit test (5 farklı istek tipi)
  [ ] ResultMerger unit test (çakışma senaryoları)
  [ ] CostGuard unit test (limit senaryoları)
  [ ] AgentRunner unit test (mock opencode spawn)
  [ ] Integration test: /bcs-agent basit feature isteği
  [ ] Integration test: /bcs-status çalışıyor mu?
```

---

## README.md GEREKSİNİMLERİ

```markdown
Şunları içermeli:

1. Bir cümle özet: "OpenCode için paralel subagent orkestrasyon, token takibi, Graphify ve Context Mode yönetimi"
2. Kurulum (3 satır):
   npm install -g better-code-soul
   # OpenCode'u yeniden başlat
   /bcs-status
3. Komutlar tablosu:
   /bcs-status          → Genel durum
   /bcs-tokens [dönem]  → Token/maliyet raporu
   /bcs-models          → Model listesi
   /bcs-agent "görev"   → Paralel subagent orkestrasyon  ← öne çıkar
   /bcs-graphify        → Graphify yönetimi
   /bcs-context-mode    → Context Mode yönetimi
   /bcs-optimize        → Optimizasyon önerileri
4. Paralel Subagent nasıl çalışır? (diyagram + örnek, öne çıkar)
5. Graphify nedir? (2 paragraf + kurulum komutu)
6. Context Mode nedir? (2 paragraf + kurulum komutu)
7. Gereksinimler: Node.js 18+, OpenCode kurulu
8. Lisans: MIT
9. Türkçe + İngilizce README (iki dosya)
```

---

## BAŞLAT

Yukarıdaki tüm spesifikasyonu okuduktan sonra şu sırayla ilerle:

1. `package.json`, `tsconfig.json`, `tsup.config.ts` oluştur
2. `src/utils/` klasörünü implement et (platform, spawn, format, logger)
3. `src/services/Database.ts` implement et (SQLite + migrasyon)
4. `scripts/postinstall.js` yaz
5. Build çalışıyor mu kontrol et: `npm run build`
6. Faz 2 servislerini implement et — özellikle `ModelRegistry.getBestFor()` kritik
7. Faz 3 plugin ve hook'ları implement et
8. **Faz 4 paralel subagent sistemini implement et** — önce CostGuard → AgentRunner → TaskDecomposer → ResultMerger → Orchestrator sırası
9. Faz 5 tool'ları implement et — `/bcs-agent` en son, çünkü Orchestrator'a bağlı
10. Her tool'dan sonra manuel test: OpenCode'da çalıştır, çıktı doğru mu?
11. Faz 6 CLI ve kurulum
12. Faz 7 test'leri yaz

**Kurallar:**
- Her dosyayı bitirince TypeScript hataları sıfır olmalı.
- `npm run build` her adımdan sonra çalışmalı.
- Hata varsa bir sonraki dosyaya geçme — düzelt.
- Subagent akışı: `TaskDecomposer` asla model çağrısı yapmaz. Sadece kural tabanlı.
- `CostGuard` her zaman `Orchestrator`'dan önce çalışır. Atlanamaz.

---

*Better Code Soul — MIT Lisansı — Açık Kaynak*
*Paralel subagent · Token takibi · Graphify · Context Mode*
