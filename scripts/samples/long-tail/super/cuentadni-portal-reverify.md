# Banco Provincia Cuenta DNI portal — re-verification

Source: https://www.bancoprovincia.com.ar/cuentadni/contenidos/cdniBeneficios
Scraped: 2026-04-18 via Firecrawl (formats: markdown + rawHtml, waitFor 5000, onlyMainContent false). Response: 371,919 characters.

## Scan for structured data signals

| Signal | Count | Finding |
|---|---|---|
| `<script type="application/ld+json">` | 0 | No JSON-LD |
| `window.__INITIAL_STATE__` or similar | 0 | No embedded state |
| `/api/` URLs in HTML | 0 | No API hints |
| `"promociones"` / `"promos"` / `"beneficios"` JSON keys | 0 | Content not JSON-embedded |
| `axios.get(...)` / `fetch(...)` calls | 0 | SPA doesn't fetch in head |
| `window.__` (any) | 4 | Only layout/GA state |
| `cdniBeneficios` references | 14 | Just breadcrumb/URL |

**Confirmed: Phase 1 was correct on this.** The portal is a marketing shell with no embedded promo JSON. The actual Cuenta DNI promo data lives in the mobile app.

## Implication

Our go-to-production path for Cuenta DNI remains:
1. Press-article LLM extraction (see `ambito-abril-2026.extract.json` — validated 9/9 promos on first pass).
2. Cross-triangulate against Infobae + iProfesional + Ámbito (all three publish the monthly roundup).
3. Optional: spot-check against Carrefour/Coto/Jumbo `/descuentos` pages which list Cuenta DNI when the chain has a specific deal.

No need to retry the portal.
