# Data Sources — How to Get Argentine Promo Data

**Principle**: Argentina has no consolidated promo API. Ingestion is a mosaic: one high-value scrape target (MODO) feeds the core wedge; wallet catalogs + supermarket-native cross-bank pages cover the long tail; press-article LLM extraction fills Cuenta DNI; everything else is in-app / per-user / truly inaccessible.

This doc was rewritten in April 2026 after an end-to-end PoC (`docs/data-validation-poc.md`) and extended after Phase 2 long-tail validation (`docs/long-tail-sourcing.md`). All endpoints below were verified live. **Re-verify before relying on any of them** — the whole premise of the AR promo landscape is that it changes constantly.

## Tier 1 — Primary feed (the one that powers the wedge)

### MODO — HTML detail pages + LLM extraction

**This is the source the product is built on.** MODO detail pages use fixed-label UI blocks that an LLM can extract with near-perfect accuracy. One scrape of MODO replaces scraping ~15 individual bank sites because banks push their promos *into* MODO.

- Hub: `https://www.modo.com.ar/promos` — SPA, must be rendered by Firecrawl (`waitFor: 5000`, `onlyMainContent: true`). Raw Node fetch returns a ~47-char shell. Live hub exposes **57 unique slugs** across root + 4 `/promos/slot/web-modo-hub-*` category pages (Destacadas / Supermercados / Exclusivas Online / Financiación + "Más promos"). `modo.com.ar/sitemap.xml` lists **4,492 promo URLs** but most are historical/expired; sitemap `lastmod` is uniform (bulk-regen), NOT a per-page change signal.
- Detail pages: `https://www.modo.com.ar/promos/<slug>` — the goldmine. Fixed labels:
  - `Tope de reintegro` — maps directly to canonical `tope` + `tope_period`
  - `Monto mínimo de compra` — maps to `requires_min_spend` (**do not confuse with "saldo mínimo en cuenta"** — that's an account balance floor, not a purchase minimum; the transportevqr page has this trap)
  - `Días que aplica` — L M X J V S D icon row. **In rawHtml this carries `data-testid="day-of-week-selected-<L>"` on active days** (see gotcha #1 — this is the deterministic fix).
  - `Vigencia Del DD/MM/YY al DD/MM/YY` — maps to `valid_from` / `valid_to`
  - `Bancos adheridos` — 10-20 issuer banks per promo (icon strip truncates at "+N"; legal-text "Entidades Adheridas" section has the complete list)
  - `Medios de pago` — Visa / Master / Cabal / etc.
  - Legal text — explicit phrasing like "los días MARTES" and "hasta $X en reintegros"
- "Sin tope" / "¡Sin tope!" appears as an explicit label → maps cleanly to `tope: null`. **When `tope` is null, LLM tends to emit empty-string for `tope_period` — normalize to null in the ingestion adapter.**
- Freshness signal: slug suffixes encode the month (`-mar26`, `-abril26`, `-jun26`). **Confirmed via Wayback CDX**: `transportevqr-feb26` → `-mar26` → `-abril26` (monthly rotation). Also confirmed: a small set of "sticky" slugs (e.g. `3csi-farmacias-bna-mar24`) persist for 2+ years without rotation — these are permanent BNA programs.

**Gotchas**:

1. **`valid_days` from the L/M/X/J/V/S/D icon row.** In markdown, the icons render flat without the active-state signal — first extraction on Tuesdays-only COTO returned all 7 days. **Production fix (verified in stress-test)**: fetch rawHtml (1 credit, same as markdown) and regex `/data-testid="day-of-week-selected-([LMXJVSD])"/g`, then map `{D:0, L:1, M:2, X:3, J:4, V:5, S:6}`. 100% deterministic, no LLM, no extra cost. **LLM-only fallback**: include a REQUIRED `valid_days_reasoning: string` field in the extraction schema forcing the model to quote the legal-text fragment that justified its choice. In stress-test, this lifted valid_days accuracy from 7/10 to 10/10.
2. **Multi-rate promos under one URL.** Example: Supermiércoles Santander = 25% Indumentaria + 10% Perfumería (+librería+joyería) + 6 cuotas, all on one slug. Aiello Supervielle has two customer tiers (CG 20% vs Identité/Plan-Sueldo 25%). **Canonical schema now has an optional `variants: Promo[]`** (see `architecture.md`). At ingestion time, expand variants into separate rows keyed by `source_url#category_scope` so both rates appear in the ranking.
3. **Extract does not work on the hub page** (only on detail pages). The hub page layout is card-image + adjacent text; the LLM returns empty. Use the hub only to enumerate detail URLs; run extraction per detail URL.
4. **Cost ceiling**: ~27 credits mean / ~31 credits worst case per detail extract (stress-test measured 10 pages). Hub+slot scrapes ≈5 credits/day. **Naive daily full-refresh of ~57 live slugs ≈ 1,600 credits/day = 48k/month** → Firecrawl Standard plan ($83/mo, 100k credits) with 2x headroom. **Slug-diff incremental (only re-extract new or content-hash-changed slugs) drops the projection to ~8.5k credits/month** — still needs Standard, but with 11x headroom. Weekly incremental cadence fits Firecrawl Hobby ($16/mo, 3k credits).
5. **"Cargar más" pagination** on the hub category pages is not auto-executed by Firecrawl `firecrawl_scrape` (even with `actions: [{type: "click"}]`). The 57-slug live count is a lower bound. If precision matters, use Firecrawl Browser API or hit the slot endpoints directly — the sitemap gives an absolute ceiling (4,492) but includes all historical slugs.
6. **Cuotas-only promos return `pct=0`**. Slugs like `3csi-farmacias-bna-mar24` or `3csi-simplicity-macro-abr26` have no cashback — they're financing-only. Flag these (`type='cuotas'`) at ingestion and exclude from the cashback/tope sort.

**Coverage** (from one sampled MODO promo): Santander, Nación, Galicia, BBVA, Macro, ICBC, Supervielle, Credicoop, Ciudad, Bancor, Comafi, Santa Fe, Entre Ríos, San Juan, Santa Cruz, Columbia + billeteras YOY, BUEPP. This is the consolidation layer the market was missing.

## Tier 2 — Supplementary JSON APIs (no tope, but useful for secondary features)

These sources do NOT participate in the "sort by tope" ranking. They power a possible secondary "descuentos sin tope" tab: per-SKU prices, cuotas-sin-interés, and BIN-restricted card promos in supermarket / ecomm catalogs.

### VTEX Catalog API — Día, Carrefour, Jumbo, Disco, Vea, ChangoMás

Same API shape across every VTEX-hosted AR supermarket.

- Día — `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?_from=0&_to=49`
- Carrefour — `https://www.carrefour.com.ar/api/catalog_system/pub/products/search`
- Jumbo / Disco / Vea / ChangoMás — same path, domain per store

Per-SKU response includes `price`, `Installments` (wallet tokens like `Modo Payment`, `MercadoPagoPro`, `GOcuotas` alongside card brands), `PromotionTeasers` (per-ITEM percent-off, sometimes BIN-restricted — e.g. `"Tarjeta Carrefour 15%"` with a `RestrictionsBins` list of BIN prefixes), `DiscountHighLight`, and `PriceValidUntil`.

**Critical**: VTEX has **no `tope` field anywhere**. `PromotionTeasers.PercentualDiscount` is a checkout % off, not a cashback cap. Wedge feature does not apply to this source.

**Gotchas**:

1. **The offer key is misspelled `commertialOffer`** (not `commercialOffer`). Anyone copying from VTEX docs will silently get `undefined`. Bake the misspelling into your shape.
2. **VTEX SHA256 hash rotation** has been documented widely (Ratoneando's `decode_vtex` / `verify_vtex` CLIs), but the `catalog_system/pub/products/search` path worked without it during PoC. If a future check returns 403, fall back to Ratoneando's tooling: https://github.com/matiasbontempo/ratoneando-go.

**Not on VTEX**: Coto runs a custom stack. Ratoneando has a Coto scraper but it breaks more often than the VTEX ones. De-prioritize until the MODO pipeline is stable.

### Mercado Pago Promociones — WordPress + server-rendered HTML

`promociones.mercadopago.com.ar` is Elementor-rendered WordPress.

- Route index: `https://promociones.mercadopago.com.ar/wp-json/wp/v2/` — 200
- Category taxonomy: `https://promociones.mercadopago.com.ar/wp-json/wp/v2/vendedores_category` — 200 (8 categories: Moda 8, Electro 4, Salud y Belleza 3, Hogar 2, Turismo 1, …)
- Custom post type `mp_vendedores` is registered but REST-gated (404 on listing endpoint)
- Homepage `/` — 200, ~125 KB HTML with ~18 seller cards rendered server-side. Pct + merchant + date range are in the card blocks. Regex extraction is sufficient; LLM overkill.
- `/seller/<slug>/` — 301s to the external merchant domain (e.g., `/seller/dash/` → `dashdeportes.com.ar`). Not usable for detail extraction.

**Critical**: MP Promociones is a **cuotas-sin-interés + %-off ecomm catalog**, not cashback-with-tope. No `tope`, no `valid_days`, no `valid_regions`, no `requires_min_spend`. Do not try to rank this source by tope — it doesn't have one. MP users care about cuotas; that's a separate feature surface.

## Tier 2 (extended) — Wallet web catalogs

**Phase 2 validation (April 2026, see `long-tail-sourcing.md`) reclassified what used to be "Tier 3 manual wallets".** Most non-MODO fintech wallets publish structured promo catalogs on their public websites. Extract with the same LLM+Zod pattern as MODO.

### Brubank

- `https://brubank.com/beneficios` — HTTP 200, fully rendered Webflow static page. ~50 promo cards grouped by plan tier (One / Plus / Ultra), each with `NN% reintegro`, `Tope de reintegro: $N.NNN`, day phrase, deep link to `help.brubank.com` T&Cs article.
- 1 Firecrawl credit per refresh. Model plan tier in `issuer_bank` as `brubank-one` / `-plus` / `-ultra`, or add a `required_plan` field if more granularity is needed.

### Naranja X

- Hub: `https://www.naranjax.com/promociones` — SPA, Firecrawl-resolved (`waitFor: 6000`). Cards show pct + `Tope semanal hasta $N` + day phrase + medio de pago icons (Débito / Crédito / Dinero en cuenta / QR).
- Related surfaces: `/promociones-amba` (regional Buenos Aires promos), `/promos-relampago` (último sábado del mes 40% OFF), `/smartes` (monthly sale days), `/pagar-transporte` (100% OFF subte/colectivo), `/verano` + `/hot-sale` + `/cyber-monday` (seasonal).
- Category deep-links: `/promociones/SUPERMERCADOS_categoria`, `/promociones/medios/Super`, `/promociones/CONSTRUCCION_categoria`, etc.
- Plan Turbo / Plan Épico tope tiers documented at `/blog/epico-y-turbo-planes-para-ahorrar-con-naranja-x`.

### Ualá

- Hub: `https://www.uala.com.ar/promociones` — Next.js, Firecrawl-resolved.
- Per-merchant detail pages: `/promociones/<slug>` (e.g., `/promociones/carrefour`, `/promociones/sportclub`, `/promociones/coderhouse`, `/promociones/ualabis`). **These pages use MODO-grade fixed-label blocks**: `Días: L M M J V S D` icon row, `Métodos de pago`, `Tipo de comercio`, `Válido hasta`, `Tope de reintegro`, `Tiempo de acreditación`, `Disponible en`, full legal text.
- Same extraction recipe as MODO detail pages.

### Personal Pay

- Hub: `https://www.personalpay.com.ar/beneficios` (301s to `personal.com.ar/pay/beneficios`) — renders a paginated merchant grid (~96 partners across 8 pages). Each card exposes merchant + pct + day phrase.
- **Gotcha**: topes for Personal Pay are summarized in an IMAGE (`Desk_tabla_v2.webp` tier table) — Firecrawl markdown does not OCR. Workaround: get topes via press-article extraction (iProUp + promociones.com.ar publish monthly combo articles with explicit Nivel 1/2/3 tope numbers).
- **Backing API hint**: card images load from `beneficiosclub.personalpay.dev/partner/<slug>.png`. That subdomain is a candidate for a cleaner JSON backend — not yet probed; follow-up task.

### Cuenta DNI — via press-article extraction

- Portal `https://www.bancoprovincia.com.ar/cuentadni/contenidos/cdniBeneficios` is a marketing shell (re-verified 2026-04-18: 371 KB HTML, 0 JSON-LD, 0 `/api/` hints, 0 embedded promo JSON). Confirmed Phase 1's finding — the app is the source of truth, and we can't reach it.
- **But: press-article LLM extraction works.** Ámbito / Infobae / iProUp / iProfesional publish monthly Cuenta DNI roundups with explicit pct + tope + day + rubro in clean bullet lists.
- **Implementation (Phase 3.1, 2026-04-18):** `pnpm run-cuentadni` (auto-discovers the latest article via Firecrawl search → prefers Ámbito > Infobae > iProUp > iProfesional) or `pnpm run-cuentadni --article=<url>` (explicit override). Extraction uses direct Gemini 2.5 Flash (same Hybrid B pattern as MODO, NOT `firecrawl_extract`). The prompt emits a JSON array of `Promo` objects — one article = many promos. First live run against the Ámbito April 2026 article extracted 10/10 schema-valid promos at $0.0047 in Gemini cost. See `scripts/ingestion/cuentadni-source.ts` and `scripts/lib/cuentadni-extract.ts`.
- **Identity**: `source_id='cuenta-dni'`, `source_url=<article url>`, deterministic UUID v5 per `(source_url, merchant, pct)`. Monthly article rotation inserts fresh rows under the new URL; Phase 4 dedup collapses content-equivalent promos across months. Migration 004 dropped the old `(source_id, source_url)` unique constraint so one URL can carry N promos.
- Cost envelope: ~175 credits/month (scrape + extract × 3 articles for triangulation).
- This replaces the old "manual curation" recommendation. Operator burden near zero.
- See `long-tail-sourcing.md`, `scripts/samples/cuentadni-press-extraction/`, and `docs/sources.md` for the adapter playbook.

### Galicia (and other non-MODO bank promos)

- `https://www.galicia.ar/personas/buscador-de-promociones.model.json` returns ~60 KB but the content is an AEM page skeleton with an `<iframe>` to `https://beneficios.galicia.ar/` — a Next.js SPA with `channelId: onlinebanking` that loads all promo data from `/bff/*` behind online-banking auth. Every unauthenticated path probed (`/bff/promociones`, `/bff/promociones/list`, `/promos`, `/promotions`, `/api/promociones`) returns the 5,120-byte SPA shell.
- **There is no unauthenticated structured Galicia feed.** Invalidated. Get Galicia via MODO (Galicia is one of ~19 adhered banks on sampled MODO promos) OR via the cross-wallet supermarket catalogs below (Coto, Jumbo, Carrefour all attribute Galicia promos explicitly).

### Other AR banks (Santander, Macro, Nación, Ciudad, Supervielle, ICBC, HSBC, BBVA)

- Each has its own "buscador de promociones" page. All Akamai Bot Manager + Adobe Analytics. Scraping difficulty: Hard → Fortress.
- **Don't scrape these directly.** Their promos appear in MODO AND in the supermarket cross-wallet catalogs below. One Medium-difficulty scrape beats ten Fortress-difficulty ones.

## Tier 2 (extended) — Supermarket-native cross-wallet catalogs

**Phase 2 discovery**: The big three AR supermarket chains publish their own cross-bank/cross-wallet promo catalogs at known static URLs. These are NOT in MODO (MODO doesn't index per-chain own-cupones), and they include chain-native cupon programs that PromoArg does not source.

**Phase 3.3 landed (2026-04-18)**: Adapters live for all three chains — `pnpm run-coto` / `pnpm run-jumbo` / `pnpm run-carrefour`. Per-source guides in `docs/sources/{coto,jumbo,carrefour}.md`. First-run totals: Coto 48 promos, Jumbo 14 promos, Carrefour 25 promos. Own-cupon wallets extended via migration 005: `comunidad_coto`, `jumbo_mas`, `mi_carrefour`.

### Coto

- Primary: `https://www.coto.com.ar/descuentos/` — HTTP 200, 1 credit. Day-grouped catalog (Lunes / Martes / Miércoles / Jueves / Viernes / Fin de Semana).
- Mirror: `https://www.cotodigital.com.ar/sitios/cdigi/descuentos` — same data.
- Each promo block: bank/wallet logo + day phrase + `NN% descuento` or `NN cuotas sin interés` + subheading + fine print with tope + vigencia.
- **Includes chain-native own-cupon**: Comunidad Coto 15% miércoles sin tope (siendo miembro, todos los medios de pago). This is the kind of deal PromoArg misses.
- Also includes Naranja X Plan Turbo martes 25% tope $12k, MODO martes 20% tope $25k, Supervielle-MODO 25% tope $30k, all attribution-logged per block.

### Jumbo

- Primary: `https://www.jumbo.com.ar/descuentos-del-dia` — HTTP 200, 1 credit. Filterable by Por día / Por banco / Cenco Pay / Planes de Financiación.
- Secondary: `https://www.jumbo.com.ar/jumbo-al-cien` — the **Jumbo al 100 pesoscheck program**: buy marked items in an emisión window (Fri-Sun) → receive physical cupón checks → redeem in the canje window (following Fri-Sun). Requires Jumbo+ loyalty (free). Rotates monthly — needs monthly re-scrape.
- Tertiary: `https://www.jumbo.com.ar/eventos/descuentos-jumbo-prime` — Jumbo Prime loyalty tier.

### Carrefour

- Primary: `https://www.carrefour.com.ar/descuentos-bancarios` — HTTP 200, 1 credit, ~70 KB markdown. 29+ pct promos, 52+ tope mentions, all days of week. Includes Patagonia 28 mentions (heavy partner), Mercado Pago 20, Naranja 16, MODO 7, Cuenta DNI 4 (!), Mi Carrefour 3.
- **Critical surprise**: Carrefour runs universal cross-wallet promos. Verbatim quote: *"BILLETERAS VIRTUALES PARTICIPANTES: CARREFOUR BANCO, MERCADO PAGO, CUENTA DNI, MODO, NARANJA X, UALÁ, BNA+, PERSONAL PAY, PREX... EL BENEFICIO CONSISTE EN UN 10% DE DESCUENTO, SIN TOPE DE REINTEGRO"*. This surfaces Cuenta DNI and Personal Pay deals that Phase 1 classified as unreachable.
- **Backing-API status**: the promo catalog IS backed by a VTEX dataentity called `BP` (confirmed via image URLs of shape `carrefour.com.ar/api/dataentities/BP/documents/{uuid}/img_card_N/attachments/{wallet}.png`). Probed 2026-04-18 as part of Phase 3.3: `search?_fields=id` returns 200 with record UUIDs, but EVERY content field (`name`, `title`, `description`, `day`, `percent`, `bank`, `tope`, `image`, `logo`, `label`, plus the likely Spanish variants) returns `403 "Cannot read private fields"`. The dataentity is auth-gated for content. **HTML fallback is the only viable path** — implemented in `scripts/ingestion/carrefour-source.ts`. Full probe transcript in `docs/sources/carrefour.md`.
- `/especial-cupones` is a usage explainer only (no listing). `/promociones` returns 85 KB but is mostly banner images. `/app` and `beneficiarios.carrefour.com.ar` (login-gated) point to the Mi Carrefour app for per-user cupones — app-locked, refer to press coverage.

### Own-cupon programs (supermarket-native, PromoArg gap)

| Program | Chain | Mechanic | Source |
|---|---|---|---|
| Comunidad Coto | Coto | Membership (free), 15% miércoles sin tope, additional per-day deals | `coto.com.ar/descuentos` |
| Jumbo al 100 | Jumbo | Monthly emisión+canje pesoscheck cycle, Jumbo+ loyalty required | `jumbo.com.ar/jumbo-al-cien` |
| Mi Carrefour | Carrefour | Per-user cupones (birthday, ANSES, etc.) activated in mobile app | App-only; refer to press |

## Tier 3 — Genuinely unreachable (residual)

After Phase 2, the Tier 3 residual is narrow:

- **Per-user in-app cupones** — Mi Carrefour birthday cupon, personalized Cuenta DNI push notifications, Mercado Pago "hot offers" pushed to specific users. These are genuinely per-user and no aggregator can surface them without per-user OAuth into each app. Out of scope.
- **Staff-only / partner portals** — `beneficiarios.carrefour.com.ar` (internal), Galicia online-banking BFF endpoints. Not targeting.

## What does NOT exist (don't waste time searching)

- **No consolidated official feed.** BCRA, AFIP, and datos.gob.ar publish none.
- **Precios Claros is dead** (program discontinued ~2023). But `OpenDataCordoba/precios_claros` on GitHub still has the cadena/sucursal ID map — use it to bootstrap the stores DB if we ever need one.
- **No commercial AR promo-data vendors exist.** Searched extensively; the space is consumer-facing content sites, not B2B data.

## Core sourcing principles

1. **MODO is the anchor, not the only source.** MODO carries ~19 national bank issuers in one scrape. But the supermarket cross-wallet catalogs (Coto, Jumbo, Carrefour `/descuentos-bancarios`) add chain-native own-cupones and cross-wallet universal promos that MODO doesn't index. Always scrape both tiers.
2. **Don't scrape banks directly.** Their promos show up in MODO AND in the supermarket cross-wallet catalogs. One Medium-difficulty scrape beats ten Fortress-difficulty ones.
3. **Extract with LLM + Zod schema, not per-site CSS parsers.** MODO's layout re-themes periodically; schema-validated LLM extraction absorbs drift. Pre-trim HTML to `onlyMainContent` before the LLM call — full-page extraction 5-10x's the bill and hurts accuracy.
4. **Slug-diff before re-extract.** MODO slugs encode the month (`-mar26`). Hub-crawl daily (cheap) to enumerate slugs; only run extract on slugs whose month changed or whose content hash changed. Apply the same pattern to Jumbo al 100 (month-rotating).
5. **Never hard-delete promos on scrape failure.** Upsert-with-TTL: mark `last_seen_at`, serve anything seen in the last N days (N≈3 for weekly-changing promos), only hard-delete after two consecutive successful scrapes confirm a promo is gone.
6. **Every scrape run logs** `{source_id, started_at, finished_at, promo_count, schema_valid, raw_html_hash, error}`. Per-source metrics are the single biggest factor between an aggregator that survives 6 months and one that silently rots.
7. **Press extraction is a first-class source for Cuenta DNI.** Ámbito + Infobae + iProUp monthly roundups extract cleanly with `firecrawl_extract` + Zod schema. Triangulate across at least two outlets before trusting topes. Total cost < 200 credits/month.
8. **Schema patch**: `tope_period` should accept `null` when `tope` is null. "Sin tope" promos are common; current schema forces an awkward default.
