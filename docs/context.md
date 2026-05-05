# Context — Competitors, Prior Art, Legal, Community

## Competitors

| Name | Model | Notes |
|---|---|---|
| **PromoArg** (promoarg.com) | Next.js on Vercel; LLM-extraction-based ("PromoGPT" beta); solo-dev project | Best existing coverage. Filters by bank/category/day. **No sort-by-tope.** Monetized via AdSense + MercadoLibre affiliate. This is the closest public analog to what we're building. |
| **Clash** (clash.com.ar) | B2B SaaS (merchants self-serve via `panel.clash.com.ar`); Rosario-based, externally-backed startup | Data quality is high because merchants push, but no cross-source ranking. Real-time. Native iOS + Android. |
| **Descuentazo** (descuentazo.com.ar) | Next.js; community-submitted + founder-curated. Reddit-origin. | Low-volume side project. Has a public "calculadora de ahorro real que contempla topes" (Nov 2025) — philosophically closest to our thesis. |
| **Promofy / OfertApp** (promofy.com.ar) | Next.js on Cloudflare; 100% community-submitted (Slickdeals-style); UUID-based offer IDs (suggests Postgres/Supabase) | Heavy MercadoLibre affiliate bait. Aggressively blocks AI crawlers (ClaudeBot, GPTBot, CCBot disallowed). |
| **Ratoneando** (ratoneando.ar) | Vite + React SPA + Go/Gin + Redis backend; open source (MIT) | **Price comparison**, not promos. Ships production VTEX scrapers with SHA256 hash rotation — solid open-source reference for that pattern. |

## Prior art worth referencing

- **ratoneando-go** (MIT, on GitHub) — production-tested VTEX scrapers for Carrefour, Coto, Día, Jumbo/Disco/Vea, plus `decode_vtex` / `verify_vtex` CLI tooling for hash rotation. Most useful AR open-source reference for this project.
- **OpenDataCordoba/precios_claros** — cadena/sucursal ID map from the now-dead Precios Claros program. Use it to bootstrap the stores table.
- **datosgobar/series-tiempo-ar-bcra-scraping** — government-maintained BCRA scraper; useful reference pattern for retry/proxy logic with AR financial sites.

## Legal posture (summary)

**Personal use: zero legal risk.** Public use is viable with standard mitigations.

Key points:
- **Factual data isn't copyrightable.** Promo terms (tope, vigencia, rubros) are facts, not creative content. Ley 11.723 doesn't apply. Argentina has no *sui generis* database protection.
- **CSJN "Veraz c/ Open Discovery" (Dec 2024)** greenlights displaying third-party trademarks under nominative fair use, provided no consumer confusion about origin. Showing Carrefour / BBVA / Visa / MODO logos to identify promos is fine; add a disclaimer that we're not affiliated.
- **No precedent of AR banks suing aggregators.** PromoArg, Clash, Descuentazo, Ratoneando have all operated publicly for years without litigation.
- **Biggest residual risk: Ley 24.240 (Defensa del Consumidor)**, arts. 4/8/40 — liability if we show stale/wrong data and a user doesn't get the reintegro. Mitigations: prominent "última actualización" badge, "información referencial, verificar en la entidad emisora" disclaimer, source links to the bank's official terms, a user-correction workflow.
- **BCRA doesn't regulate us.** Their scope is PSPs and credit advertising. We don't move money or issue credit.
- **Data protection (Ley 25.326)** is a non-issue if we keep user wallet selections local-first. Register with AAIP only if we store user data server-side.
- **Why the gap exists isn't legal — it's operational.** Promos change weekly, no APIs, terms live in PDFs and dynamic JS pages. Solo curation doesn't scale; scrapers break silently. That's the real barrier.

## AR dev community — sources worth following

- **OpenDataCordoba** (github.com/OpenDataCordoba) — civic-tech collective; Precios Claros maintainers.
- **datosgobar** (github.com/datosgobar) — Argentine government open-data team.
- **r/DescuentosArgentina** and **r/devsarg** — active threads on scraping, Telegram bots, tope-aware hunting. Good for sensing the user community.
