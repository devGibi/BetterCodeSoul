# Better Code Soul

OpenCode icin paralel subagent orkestrasyon, token takibi, Graphify ve Context Mode yonetimi plugini.

## Kurulum

```bash
npm install -g better-code-soul
better-code-soul setup
# OpenCode'u yeniden baslatin
/bcs-status
```

## Komutlar

| Komut | Aciklama |
|-------|----------|
| `/bcs` | Interaktif dashboard'u ac (TUI) |
| `/bcs-status` | Genel durum ozeti — token, maliyet, aktif araclar |
| `/bcs-tokens [donem]` | Token ve maliyet raporu (session, today, week, month) |
| `/bcs-models` | Kullanilabilir modeller, auth durumu ve fiyat karsilastirmasi |
| `/bcs-agent "gorev"` | Deterministik gorev ayrıştırma ile paralel subagent orkestrasyon |
| `/bcs-graphify` | Graphify hafiza sistemi yonetimi |
| `/bcs-context-mode` | Context Mode token tasarrufu yonetimi |
| `/bcs-optimize` | Token optimizasyon onerileri |

## Dashboard

`/bcs` komutu 5 sekmeden olusan interaktif bir terminal dashboard'u acar:

1. **GENEL** — 7 gunluk token kullanim grafigi, context dolumu, arac durumu
2. **MODELLER** — Model tablosu (tier, fiyat, baglanti durumu)
3. **AGENTLAR** | Son orkestrasyon sonucu ve agent adimlari
4. **ARACLAR** | Graphify ve Context Mode durumu ile toggle kontrolleri
5. **OPTIMIZE** | Kullanim verilerine dayali optimizasyon onerileri

Kisayollar:
- `[1]-[5]` — Sekme degistir
- `[G]` — Graphify toggle (Sekme 4)
- `[C]` — Context Mode toggle (Sekme 4)
- `[B]` — Graf build/guncelle (Sekme 4)
- `[ESC]` veya `[Q]` — Dashboard'u kapat

## Paralel Subagent Orkestrasyon Nasil Calisir?

```
Geleneksel yaklasim (yavas):
  Kullanici: "Kullanici profil sayfasi ekle"
  → Tek model (Opus, $15/1M) tum isi yapar
  → Planlama + kod + test + review = tek context, sirayla
  → Sure: 15 dk · Maliyet: $0.45

Better Code Soul yaklasimi (hizli):
  Kullanici: "Kullanici profil sayfasi ekle"
  → TaskDecomposer gorev tipi, karmasiklik ve context analizi yapar
  → ModelRouter her tier icin en uygun modeli secer
  → PlannerAgent (Gemini Pro, $1.25/1M) → mimari plan → 2 dk
  → Paralel baslar:
       CoderAgent A (Kimi K2, $0.60/1M) → ProfileCard component → 3 dk
       CoderAgent B (Kimi K2, $0.60/1M) → API endpoint → 3 dk
       CoderAgent C (DeepSeek V3, $0.27/1M) → DB migration → 3 dk
  → ReviewerAgent (Haiku, $0.80/1M) → dogrulama → 1 dk
  → ResultMerger → birlestir + cakisma coz
  → Sure: 4 dk (paralel) · Maliyet: $0.06

Tasarruf: %87 maliyet, %73 sure
```

## Model Router

Model secimi `src/services/ModelRouter.ts` dosyasinda izole edilmistir. Yeni model cikinca routing tablosuna bir satir eklemen yeterli — baska hicbir dosyaya dokunma.

Routing onceligi:
- **PLAN tier**: gemini-2.5-pro → claude-opus-4-5 → o3
- **CODE tier**: kimi-k2 → deepseek-v3 → glm-4-plus → claude-sonnet-4-5 → gpt-4o → gemini-2.5-flash
- **REVIEW tier**: claude-haiku-4-5 → gpt-4o-mini → gemini-2.5-flash

## Graphify

Graphify proje kodunuzdan bir bilgi grafigi olusturur. Model tum dosyalari okumak yerine grafigi sorgular.

```bash
/bcs-graphify install   # Graphify'yi kur
/bcs-graphify build     # Mevcut proje icin graf olustur
/bcs-graphify enable    # Bu projede aktiflesdir
```

Aktif oldugunda, Graphify otomatik olarak ilgili context ozetlerini system prompt'a enjekte eder.

## Context Mode

Context Mode tool ciktilarini model context'ine girmeden once ozetler.
Bu, tool output token'larinin yaklasik %98'ini tasarruf eder.

```bash
/bcs-context-mode install   # Global kur
/bcs-context-mode enable    # Bu projede aktiflesdir
/bcs-context-mode stats     # Tasarruf goruntule
```

## MCP Server

Better Code Soul ayni zamanda bir MCP server olarak calisir:

```bash
better-code-soul mcp
```

Bu tum araclari Model Context Protocol (stdio transport) uzerinden sunar.

## CLI Komutlari

```bash
better-code-soul setup     # Plugin ve komutlari OpenCode'a kaydet
better-code-soul status    # Kurulum durumunu kontrol et
better-code-soul mcp       # MCP server baslat (stdio)
better-code-soul help      # Yardim goster
```

## Gereksinimler

- Node.js 18+
- OpenCode yuklu olmali

## Lisans

MIT
