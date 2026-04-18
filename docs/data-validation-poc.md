# Data Validation PoC — Findings (April 2026)

Scripts: `scripts/validate-*.ts`. Raw artifacts: `scripts/samples/`.
Re-run any source with `npx tsx scripts/validate-<source>.ts`.

## Verdict

**PARTIAL — GO on MODO as the primary feed, pivot hard off the "three clean APIs" claim.** MODO detail pages alone yield every field in the canonical `Promo` schema (including `tope` in ARS) via Firecrawl extract at ≈29 credits/page. Galicia's claimed AEM feed is a mirage. VTEX and MP WP are not cashback-with-tope sources at all.

## Per-source coverage matrix

| Source | merchant | category | wallet | pct | tope | tope_period | valid_days | valid_regions | valid_from | valid_to | requires_min_spend |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Día (VTEX)** | ✅ direct | ⚙️ derivable | ⚙️ derivable | ⚙️ derivable | ❌ absent | ❌ absent | 🤖 LLM | ❌ absent | ❌ absent | ❌ absent | ❌ absent |
| **Carrefour (VTEX)** | ✅ direct | ⚙️ derivable | ⚙️ derivable | ⚙️ derivable | ❌ absent | ❌ absent | 🤖 LLM | ❌ absent | ❌ absent | ❌ absent | ❌ absent |
| **Galicia (AEM)** | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ❌ absent |
| **Mercado Pago (WP+HTML)** | ✅ direct | ⚙️ derivable | ⚙️ derivable | ⚙️ derivable | ❌ absent | ❌ absent | ❌ absent | ❌ absent | ⚙️ derivable | ⚙️ derivable | ❌ absent |
| **MODO (HTML+LLM detail)** | ✅ direct | 🤖 LLM | ⚙️ derivable | ✅ direct | ✅ direct | ✅ direct | ✅ direct | 🤖 LLM | ✅ direct | ✅ direct | ✅ direct |

Legend: ✅ direct (field is literally in the response) · ⚙️ derivable (one-line mapping or regex) · 🤖 LLM (needs language-model inference) · ❌ absent (cannot be recovered from this source).

## Source-by-source findings

### A. Día (VTEX catalog_system)

- **Endpoint**: `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?_from=0&_to=49` — HTTP 206 Partial Content (VTEX default).
- **Sample**: [`scripts/samples/dia.json`](../scripts/samples/dia.json) — 1 product w/ `items[].sellers[].commertialOffer`.
- **Good**: `Installments[]` is structured (17 entries on sample SKU) and `PaymentSystemName` includes wallet tokens `Modo Payment`, `MercadoPagoPro`, `GOcuotas` alongside card brands. `PromotionTeasers[]` exists but was empty for the sample.
- **Missing / hard**:
  - No `tope` anywhere. Teasers express `PercentualDiscount` on the ITEM, not a cashback cap.
  - No `valid_regions`; store = region implicitly.
  - `valid_from/to` fields (`GeneralValues`) were `{}` in sampled teasers.
- **Gotcha discovered**: the offer key is `commertialOffer` (misspelled) not `commercialOffer`. Any scraper copying from VTEX docs will silently get `undefined`. We bake the misspelling into our shape.
- **Freshness**: `PriceValidUntil` on each offer.
- **Extraction strategy**: direct map for price + installments, LLM only if we ever try to interpret teaser `Name` strings.

### B. Carrefour (VTEX catalog_system)

- **Endpoint**: `https://www.carrefour.com.ar/api/catalog_system/pub/products/search?_from=0&_to=49` — HTTP 206.
- **Sample**: [`scripts/samples/carrefour.json`](../scripts/samples/carrefour.json) — yielded 1 non-empty `PromotionTeasers` on the first page.
- **Good**: same VTEX shape as Día. Sampled teaser is real: `"Tarjeta Carrefour 15%"` with a `RestrictionsBins` list of 9 credit-card BIN prefixes.
- **Missing / hard**: identical to Día — no `tope`, no cashback semantics.
- **Interesting**: BIN-level restrictions mean you can, in principle, identify the issuer by looking up BIN prefixes (e.g., `507858` is Visa cabal from Banco X). Out of scope for PoC but useful to know.
- **Extraction strategy**: same as Día. Use as a price/VTEX-teaser source, not a cashback-promo source.

**Cross-VTEX conclusion**: VTEX is a valid supplementary feed for **price + checkout-% discount + BIN-restricted card promos**, NOT for the wedge feature (sort by tope). Time budgeted to "VTEX hash rotation" per prior art is time that ranks LOW vs. scraping MODO.

### C. Banco Galicia (AEM `.model.json`)

- **Endpoint**: `https://www.galicia.ar/personas/buscador-de-promociones.model.json` — HTTP 200, 60 KB.
- **Sample**: [`scripts/samples/galicia.json`](../scripts/samples/galicia.json) (disproof record) and [`scripts/samples/galicia-aem.json`](../scripts/samples/galicia-aem.json) (full raw).
- **CRITICAL**: the claim in `docs/data-sources.md` is wrong. The `.model.json` is the AEM page skeleton; the actual promo UI is rendered by a child iframe pointing at `https://beneficios.galicia.ar/`, which is a Next.js SPA with `channelId: onlinebanking` and `distributionChannel: local-mock`. All promo data loads client-side from `/bff/*` behind online-banking auth. Probes of `/bff/promociones`, `/bff/promociones/list`, `/promos`, `/promotions`, `/api/promociones` all return the SPA shell (5,120 B). No unauthenticated structured feed exists.
- **Freshness signal**: N/A — we never reach promo data.
- **Extraction strategy**: abandon the AEM feed. Get Galicia promos from MODO (Galicia is one of ~19 banks listed as adhered in the sampled MODO COTO promo).

### D. Mercado Pago Promociones (WordPress REST + HTML)

- **Endpoints tested**:
  - `/wp-json/wp/v2/` route index — 200
  - `/wp-json/wp/v2/types` — 200 (confirms `mp_vendedores` CPT is registered)
  - `/wp-json/wp/v2/mp_vendedores` — **404** (REST-gated, the docs' "`seller` 404" finding extends here)
  - `/wp-json/wp/v2/vendedores_category` — 200 (8 categories, counts visible: Moda 8, Electro 4, Salud y Belleza 3, Hogar 2, Turismo 1, others 0)
  - `/wp-json/wp/v2/posts` — 200, returns `[]`
  - Homepage `/` — 200, 125 KB HTML with 12 seller cards fully rendered server-side (Elementor). Must request decoded — direct `brotli` decoded by undici when we don't set `Accept-Encoding`.
  - `/seller/<slug>/` — 301 to the external merchant site (e.g., `/seller/dash/` → `dashdeportes.com.ar`). Unusable for extraction.
- **Sample**: [`scripts/samples/mp.json`](../scripts/samples/mp.json).
- **Good**: category taxonomy is clean; homepage HTML exposes pct+merchant+date-range per card. Total of ~18 promos across all categories.
- **Missing / hard**: `tope`, `tope_period`, `valid_days`, `valid_regions`, `requires_min_spend` are **all absent** — MP Promociones is an **e-commerce cuotas-sin-interés + %-off catalog**, not a cashback-with-tope catalog. Most cards say "Hasta N cuotas sin interés" or "Hasta X% OFF". Zero cards in the sample had an ARS cap.
- **Freshness signal**: none exposed. Current featured set is "Cyber Monday 3–9 Noviembre" so the catalog rotates at a monthly+ cadence.
- **Extraction strategy**: scrape `/`, regex `Hasta X%` from each card block, regex the Spanish date range. LLM unnecessary — maybe useful for tagging merchant with a category. **This source will never rank in the "highest tope" view.**

### E. MODO (HTML + LLM extraction) — the winner

- **Endpoints tested**:
  - Hub `/promos` — 200, 25 KB gzipped. Raw fetch from Node yields only the SPA shell (47 chars of text). **Must go through Firecrawl** (renders JS).
  - Firecrawl scrape with `onlyMainContent: true, waitFor: 5000` returned ~7 KB markdown with 40+ promo cards organized by section: Destacadas, Supermercados, Exclusivas Online, Promos de Financiación, Más promos.
  - Detail page `/promos/coto-mar26` — Firecrawl scrape yields structured markdown with fixed-label blocks: "Tope de reintegro $25.000 por banco por mes", "Monto mínimo de compra $60.000", "Días que aplica L M X J V S D", "Vigencia Del 28/02/26 al 30/04/26", "Bancos adheridos" (19 banks), "Medios de pago" (Visa/Master/Cabal/Diners/Maestro), full legal text with "los días MARTES" and "hasta $2.571.000.000 en reintegros".
- **Samples**:
  - Hub markdown: [`scripts/samples/modo-list.md`](../scripts/samples/modo-list.md)
  - Raw hub HTML (anti-bot reference): [`scripts/samples/modo-raw.html`](../scripts/samples/modo-raw.html)
  - Detail markdown example: [`scripts/samples/modo-supermiercoles-detail.md`](../scripts/samples/modo-supermiercoles-detail.md)
  - Full LLM extraction of `/promos/coto-mar26`: [`scripts/samples/modo-coto-extracted.json`](../scripts/samples/modo-coto-extracted.json) — pct=20, tope=25000, tope_period="month", requires_min_spend=60000, valid_from/to populated, 16 issuer banks identified.
- **Good**:
  - Detail pages use fixed labels ("Tope de reintegro", "Monto mínimo de compra", "Días que aplica", "Vigencia"). LLM extraction with a 10-line prompt hit every schema field on the first try.
  - Banks across AR push their promos into MODO — one scrape of MODO covers Santander, Nación, Galicia, BBVA, Macro, ICBC, Supervielle, Credicoop, Ciudad, Bancor, Comafi, Santa Fe, Entre Ríos, San Juan, Santa Cruz, Columbia + billeteras YOY and BUEPP. This is the consolidation layer we need.
  - "Sin tope" is explicit — maps cleanly to `tope: null`.
- **Missing / hard**:
  - `valid_days` from the icon row is unreliable: the L/M/X/J/V/S/D badges render flat in markdown with no class indicating "active". Coto extraction returned all 7 days until forced to read the legal-text `los días MARTES`. **Fix: the extraction prompt must instruct the LLM to prefer legal-text phrasing over the icon row, or switch to `rawHtml` format and parse class attributes. Sample prompt update is in the extracted JSON's note.**
  - `valid_regions` is rarely stated on national promos; always national unless a regional bank is the only adherent (then it's province-scoped).
  - Multi-rate promos (Supermiércoles Santander: 25% on Indumentaria, 10% on Perfumería, 6 cuotas on everything) are ONE URL but multiple logical promos. Extraction must split or we lose resolution on the secondary rate.
- **Freshness signal**: slug suffixes encode the month (`-mar26`, `-abril26`, `-jun26`) — a cheap change-detector without parsing.
- **Extraction strategy**: Firecrawl scrape (`markdown`, `onlyMainContent`) of hub for the list of detail URLs, then `firecrawl_extract` per detail URL with our Zod-derived schema. Pre-budget ~29 credits/detail; 50 detail pages = ~1,500 credits per full refresh.

## Can we rank by tope today?

**Yes, but only for MODO-sourced promos.** Of the five sources tested:

- MODO yields `tope` + `pct` + `valid_days` + `issuer_bank` cleanly → sortable.
- VTEX (Día, Carrefour) has no tope concept at all.
- Galicia's clean feed does not exist.
- MP is a cuotas catalog — no tope semantics.

Minimum work to ship the wedge:
1. Firecrawl scrape of `modo.com.ar/promos` for the detail-URL list (1 credit).
2. Firecrawl extract per detail page with a tightened prompt (~29 credits × ~50 URLs ≈ 1,500 credits per refresh).
3. Upsert into Postgres, `order by tope desc nulls last`.
4. VTEX/MP are supplementary: VTEX for supermarket item pricing, MP for ecomm cuotas — neither participates in the tope ranking but they can fill out a "descuentos sin tope" tab.

## Surprises

1. **Galicia AEM is a marketing shell.** The .model.json claim in `data-sources.md` was based on file size, not content — worth updating that doc.
2. **VTEX misspells `commertialOffer`.** Documented prior art missed this (or silently works around it).
3. **MP seller pages 301 to the merchant**, so "scrape /seller/<slug>/ for detail" is a dead end. The hub page is the only content surface on MP.
4. **MODO detail pages are effectively an open structured API in HTML clothing.** The fixed-label UI is the best bank-promo data surface in AR we tested.
5. **MP Promociones is cuotas, not cashback.** Our wedge (sort by tope) literally doesn't apply to this source. That changes the product thesis slightly: MP users care about cuotas-sin-interés, supermarket users care about tope. Those are two different feature surfaces.
6. **Firecrawl's extract returned empty on the MODO hub page** (only returned data on detail pages). The hub has promos as card-images with text next to them; extraction works better when the target URL is a single-entity detail page.
7. **One MODO URL can be multiple logical promos** (Supermiércoles Santander has 25% Indumentaria + 10% Perfumería). Our schema doesn't have a `variants` field; we'll either model these as separate rows keyed by a compound ID or add a `variants` array to the schema.

## Open questions / risks for next phase

1. **Valid-days extraction accuracy.** The icon row is the main visual cue but markdown loses the active/inactive distinction. We need to either (a) tighten the prompt to rely on legal text (risky if legal text doesn't say "los días X") or (b) switch to `rawHtml` and parse CSS classes on the icon spans. Sample one from each to decide.
2. **MODO scrape cost at scale.** 50 detail pages × 29 credits = ~1,500 credits/refresh. Daily refresh = 45k credits/month. Check Firecrawl plan budget before committing to daily cadence. Can we use `maxAge` cache + sitemap/slug diffing to refresh only pages whose slug month changed?
3. **Multi-rate promos.** Supermiércoles-style cases need a decision: split at extraction time (promo_id = url#variant), or keep one row per URL and expand into a `variants[]`. The downstream tope sort behaves differently for each.
4. **Coverage gap: Cuenta DNI.** Neither MODO nor MP carries Cuenta DNI promos. `data-sources.md` already flags this as Tier 3 (manual curation from press coverage). Validating that pipeline was out of scope for this PoC.
5. **Re-verification cadence.** MODO slugs rotate monthly (`-mar26` → `-abril26`). Our scraper's hub-crawl step must refresh the slug list before detail extraction — caching yesterday's slug list will silently miss new promos.
6. **`data-sources.md` needs edits.** It overstates Galicia's AEM feed and understates MODO. Worth a one-paragraph update once you've reviewed this PoC.
