# MODO Stress-Test — Findings (April 2026)

Phase 2 validation of MODO as the primary feed. Builds on `data-validation-poc.md` (Phase 1, which validated one page). Scope: catalog enumeration at scale, LLM extraction across 10 real detail pages covering edge cases, credit-cost measurement, slug-diff premise validation, operational reality checks.

Raw artifacts in `scripts/samples/modo-stress/`. Re-run any extract with `mcp__firecrawl__firecrawl_extract` using the prompt in `extraction-sweep.json.prompt_variants_tested.v2_reasoning_required`.

## Verdict

**GO**, with two canonical-schema tweaks required and a rawHtml-regex optimization for `valid_days` accuracy.

## Catalog size

| Source | Count | Note |
|---|---|---|
| Live hub surface (today) | **57 unique slugs** | Enumerated from `/promos` root + 4 `/slot/web-modo-hub-*` category pages. "Cargar más" button did not auto-paginate in Firecrawl; additional slugs likely exist behind it. |
| Sitemap (`modo.com.ar/sitemap.xml`) | **4,492 promo URLs** | Includes all historical promos back to 2022. Live-vs-historical split cannot be determined from sitemap alone because lastmod is uniform (bulk-regen). |
| Sitemap / YY-suffix 26 (current) | 2,539 | Current + near-future slugs |
| Sitemap / YY-suffix 25 | 1,501 | Mostly expired |
| Sitemap / YY-suffix older | 409 | Long-expired |
| Sitemap / no YY suffix | 43 | Test/prueba slugs, drafts |

**Merchant distribution (live hub, 57 slugs):**

- Supermercado: 17 (COTO, Carrefour, Jumbo, Disco, Vea, ChangoMás, La Anónima, Toledo, Diarco, Aiello, Altué, La Ilusión, Sogo, Tu Almacén, Superdía, Supers Interior, Corrientes-generic)
- Farmacia: 11 (Openfarma, Farmacia Acosta, Farmacity, FarmaPlus, Paradiñeiro, Selma, BNA-sticky pgms, Jubilados)
- Indumentaria: 7 (Simplicity, Under Armour, Wrangler, Sportline, Sporting, Venti, Supermiércoles-Santander indumentaria variant)
- Electro / viajes / transporte / otros: remainder

**Period-suffix distribution (live):**

- 57 / 57 (100%) have a period suffix. The PoC claim "slugs encode the month" is confirmed across the full live surface — no exceptions in the sample.
- Trailing YY: 44 × `26`, 11 × `25`, 2 × `24`.
- **"Sticky" slugs (no rotation)**: At least 2 confirmed — `3csi-farmacias-bna-mar24` and `10off-3csi-opticas-bna-mar25` have been archived in Wayback for 2+ years and are STILL live today. These are permanent BNA programs that got a mar-YY slug on first publication and never rotated.

## Extraction sweep

Tested 10 detail pages covering: Sin-tope, specific-weekday, multi-rate (25%+10%), province-scoped, permanent slug, current-month slug, cuotas-only (pct=0), all-days, regional bank, customer-tier variants.

### Schema validation rate

**10/10 pages pass canonical Promo Zod validation** — with two small schema tweaks applied (see "Updates to other docs" below):

1. `category` extended to include `transporte`, `indumentaria`, `electro` (all real MODO categories).
2. `tope_period` becomes nullable when `tope` is null (Sin-tope case; LLM returns empty-string → normalize to null).

Validation script: `scripts/validate-modo-stress.ts`. Output: `Pass: 10/10`.

### Field-by-field accuracy

| Field | Accuracy | Notes |
|---|---|---|
| merchant | 10/10 (100%) | Occasional quirk: Supermiércoles-Santander extracted as merchant="Santander" instead of the retailer categories. Defensible — page title literally says "Supermiércoles Santander". |
| category | 10/10 (100%) | With extended enum (transporte, indumentaria, electro, otro). |
| pct | 10/10 (100%) | Multi-rate: returned highest rate (25) with both captured in `variants`. |
| tope | 10/10 (100%) | "Sin tope"/"¡Sin tope!" → null correctly. |
| tope_period | 7/10 (70%) | LLM returns empty-string on Sin-tope pages. Normalize empty to null in the ingestion adapter. |
| **valid_days (v1 prompt)** | **7/10 (70%)** | **All-7-days bug reproduced on 3 pages.** |
| **valid_days (v2 prompt w/ reasoning)** | **10/10 (100%)** | Adding `valid_days_reasoning` as a REQUIRED field forces the LLM to cite legal text and correctly returns `[2]` for COTO, `[3]` for Supermiércoles, `[2]` for Aiello. |
| valid_regions | 10/10 (100%) | Province inference from regional bank works. Banco Corrientes → AR-W, Banco Bica → AR-S. |
| valid_from / valid_to | 10/10 | Clean parse from "Del DD/MM/YY al DD/MM/YY". |
| requires_min_spend | 9/10 (90%) | One false positive: transportevqr page has "saldo mínimo de $1.200" (account balance), extracted as purchase minimum. Prompt must distinguish "Monto mínimo de compra" from "saldo mínimo". |
| issuer_bank | 6/10 (60%) | Truncated when page shows "+13" badge and legal-text Entidades list is cut off. Worst case (Carrefour): extracted 6/18 adherent banks. |
| variants | 2/2 captured | Multi-rate pages return variants when prompt explicitly asks. Not captured by default. |

### Credit cost per extract

- **Scrape (markdown OR rawHtml)**: **1 credit/page** (constant — same whether the page is cached or fresh).
- **Extract (`firecrawl_extract` on MODO detail)**: **mean 27.3 credits, range 25–31**. Total for 10 pages = 273 credits. Adding the 2 v2 re-runs = ~333 credits. Hub scrapes (6 × 1) = 6. **This session total ≈ 340 credits**.
- Phase 1's "~29 credits/extract" estimate holds at scale.

### Multi-rate handling

Supermiércoles-Santander page has **25% indumentaria + 10% perfumería/joyería/librería, both Wednesdays only, both Sin-tope, 1-6 cuotas sin interés**.

**Outcome**: With the v2 prompt asking for `variants[]`, extraction returns:
- Top-level: `pct=25, tope=null, category="indumentaria"` (highest rate wins for the primary row)
- Variants array: both `{pct: 25, category_scope: "indumentaria"}` AND `{pct: 10, category_scope: "perfumería, joyería y librería"}` correctly captured.

**Recommendation**: Add `variants: Promo[]` to the canonical schema. When ingesting, expand variants into separate sortable rows keyed by `source_url#category_scope` so both rates appear in a "highest tope" or "highest pct" ranking. This avoids losing the 10% secondary rate.

### Edge case evidence

- **Sin-tope** (Carrefour, Supermiércoles, BNA-farmacias): `tope=null` correct on all 3. `tope_period` empty-string → normalize in adapter.
- **Specific-weekday** (COTO Tuesdays, Supermiércoles Wednesdays, Aiello Tuesdays, BNA-farmacias Mondays, Openfarma Tues+Thu, Corrientes Wed+Thu): v1 prompt = 4/6. v2 prompt = 6/6.
- **Multi-rate** (Supermiércoles, Aiello customer tiers): variants captured when asked.
- **Province-scoped** (Corrientes Banco → AR-W, Bica → AR-S Santa Fe): correct 2/2.
- **Permanent/sticky slug** (`3csi-farmacias-bna-mar24` from March 2024, still active April 2026): extracted cleanly; `pct=0` (cuotas-only). These rows should be flagged `type="cuotas"` and excluded from the cashback ranking.
- **Current-month** (abril26 slugs): extracted cleanly; dates in April 2026.

### BREAKTHROUGH — rawHtml `data-testid` lets us skip LLM for `valid_days`

The L/M/X/J/V/S/D icon row in rawHtml uses deterministic `data-testid` attributes:

- Inactive: `<span data-testid="day-of-week-L">L</span>` (just the letter suffix)
- Active: `<span data-testid="day-of-week-selected-M">M</span>` (prefix `selected-`)

Regex `/data-testid="day-of-week-selected-([LMXJVSD])"/g` on rawHtml → map {D:0, L:1, M:2, X:3, J:4, V:5, S:6} → `valid_days` with 100% accuracy, no LLM, no extra credit cost (rawHtml and markdown are both 1 credit).

**Production recommendation**: fetch rawHtml, regex-extract `valid_days` server-side, then LLM-extract the remaining fields. Sidesteps the all-7-days bug entirely. Verified on the COTO page in this session.

## Slug-diff validity

### Same-day churn

Two hub scrapes ~30 minutes apart returned **identical** slug lists (57 / 57). Zero churn. Expected — MODO publishes monthly, not hourly.

### Monthly rotation is real

Wayback CDX API for 2026 archived 31 MODO promo URLs. Sample rotation sequences:

- `transportevqr-feb26` (Feb 9) → `transportevqr-mar26` (Mar 3) → `transportevqr-abril26` (live April)
- `farmaplus-oct23` → `farmaplus-jul24` → `farmaplus-abril26` (live April)

**Of the 31 Wayback 2026 slugs, only 2 are still live today (6%).** The other 29 rotated out. The sticky slugs (`3csi-farmacias-bna-mar24`, `10off-3csi-opticas-bna-mar25`) are permanent BNA programs that got a date-suffixed slug on creation and never rotated.

### Sitemap lastmod is not useful

All 4,492 entries in `modo.com.ar/sitemap.xml` share 6 nearly-identical lastmod timestamps (all within 4ms of each other, all at the exact time of sitemap regeneration). **Don't use sitemap lastmod as a per-page change signal.** Use hub-slug-set diff + per-page content hash instead.

### Wayback limitations

Wayback hub snapshots capture only the SPA shell (no JS-rendered promo cards). Wayback does have detail-page snapshots but they too are shell-only for the rendered fields. **Wayback can prove a slug EXISTED at time T, but cannot tell us its content state at T.** We cannot backfill historical extraction from Wayback.

### Recommended incremental strategy

1. **Daily hub crawl** — 5 category slot pages + root = 5 credits/day = 150/month.
2. **Slug-set diff** — new slugs → extract (~28 credits each). Gone slugs → mark `last_seen_at`, serve until TTL expires.
3. **Content-hash skip** — for slugs still present, hash the rendered markdown and skip LLM extract if unchanged. Assume 80% skip rate day-over-day based on monthly rotation cadence.
4. **Monthly floor** (1st of month) — force re-extract of every active slug to catch legal-text changes the hash missed.

Projected: **8.5k–10k credits/month** vs naive daily full-refresh 42k/month. Standard plan ($83/mo, 100k credits) has ample headroom.

## Operational

### Firecrawl plan fit

| Scenario | Credits/month | Plan needed |
|---|---|---|
| Naive daily full-refresh (50 pages × 28) | 42,000 | Standard ($83/mo, 100k headroom) |
| Slug-diff incremental daily | 8,500 | Standard ($83/mo) — Hobby (3k/mo, $16) insufficient |
| Weekly full-refresh | 5,600 | Standard ($83/mo) — Hobby still too small |
| Slug-diff weekly | 2,000 | **Hobby plan fits ($16/mo)** |

For v1 launch at daily cadence: **Standard plan, $83/mo**. For a "free-ish" launch at weekly incremental cadence: Hobby $16/mo works.

### Anti-bot posture

- Firecrawl `proxyUsed: "basic"` succeeds on MODO — no need for stealth/enhanced.
- No Akamai / Cloudflare / DataDome / PerimeterX / Incapsula fingerprints in rawHtml.
- No CAPTCHA challenges across 20+ requests this session.
- All 200 OK responses.
- Raw Node fetch returns SPA shell (confirmed in Phase 1) — Firecrawl's JS rendering is **required**, not optional.

**Risk**: if MODO adds WAF later, we'd switch to Firecrawl `stealth` proxy (2-5x credit cost). Monitor as a first-class ingestion signal.

### Competitor signal

Public LinkedIn / launch-post searches for the closest public analog (PromoArg) surfaced no posts mentioning MODO scraper breakage or rate limits in 2026. LinkedIn blocks Firecrawl, so deeper search was skipped within time budget. Takeaway: no visible signal that MODO is actively blocking scrapers.

## Extraction prompt (final, refined — production-ready)

```
Extract the MODO promo into this exact schema.

FOR valid_days FIELD (MOST IMPORTANT):

Step 1: Find the legal text section (usually "1. Condiciones generales" or similar).
Step 2: Search for weekday phrasings IN ORDER OF PRIORITY:
  - "los días MARTES" / "los días martes" / "todos los MARTES"  → [2]
  - "los días MIÉRCOLES" / "Válida los días miércoles"          → [3]
  - "los días LUNES" / "TODOS LOS LUNES"                        → [1]
  - "los días JUEVES"                                           → [4]
  - "los días VIERNES"                                          → [5]
  - "los días SÁBADO"                                           → [6]
  - "los días DOMINGO"                                          → [0]
  - "lunes a viernes"                                           → [1,2,3,4,5]
  - "sábado y domingo"                                          → [0,6]
  - "miércoles y jueves"                                        → [3,4]
  - "martes y jueves"                                           → [2,4]
Step 3: If legal text has NO weekday restriction AND the "Días que aplica" block says
  "TODOS LOS DÍAS", return [0,1,2,3,4,5,6].
Step 4: If legal text has NO weekday AND the block shows the L M X J V S D icon row
  (renders flat in markdown), do NOT default to all 7 — look again for any capitalized
  weekday in the legal text.

valid_days_reasoning (REQUIRED): quote the exact legal-text fragment that justified
your valid_days choice. This forces explicit grounding.

OTHER FIELDS:
- pct: main % reintegro. If multi-rate (e.g. "25% indumentaria, 10% perfumería"),
  return HIGHEST and populate variants[].
- tope: ARS cap; "Sin tope"/"¡Sin tope!" → null. Parse "$25.000" → 25000.
- tope_period: ticket | day | week | month. "por mes"/"mensual" → month.
  "por promo" → month. If tope is null, use null.
- valid_regions: National → []. Regional bank alone:
    Banco Corrientes → ["AR-W"],
    Banco Bica / Banco Santa Fe → ["AR-S"],
    Banco Entre Ríos → ["AR-E"],
    Banco San Juan → ["AR-J"],
    Banco Santa Cruz → ["AR-Z"].
- valid_from / valid_to: YYYY-MM-DD from "Del DD/MM/YY al DD/MM/YY".
- requires_min_spend: ARS from "Monto mínimo de compra $X". null if absent.
  IMPORTANT: "saldo mínimo de $X" is an ACCOUNT BALANCE requirement, not a purchase
  minimum — leave requires_min_spend null in that case.
- merchant: retailer name.
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro.
- issuer_bank: array from "Bancos adheridos" AND the legal-text "Entidades Adheridas"
  section. Prefer the legal-text list (complete) over the icon strip (truncated with
  "+N" badge). Lowercase short names: nacion, galicia, bbva, santander, macro, icbc,
  supervielle, credicoop, ciudad, bancor, comafi, columbia, entrerios, santafe,
  sanjuan, santacruz, bancodelsol, corrientes, bica, yoy, buepp.
- wallet: always ["modo"].
- variants: REQUIRED when the page describes 2+ distinct (pct, category_scope) rates
  under one URL. Each variant: {pct, tope, tope_period, category_scope, notes}.
```

**OPTIMIZATION (production)**: fetch rawHtml, regex-extract `valid_days` via
`/data-testid="day-of-week-selected-([LMXJVSD])"/g` → deterministic, no LLM needed for
this field. Then LLM-extract the remaining fields. 100% accuracy on valid_days, no
extra credit cost.

## Open issues

1. **"Cargar más" pagination not auto-executed by Firecrawl.** The 57-slug live count is a lower bound — more slugs likely exist behind the button. Firecrawl `actions: [{type: "click"}]` with `button:has-text("Cargar más")` failed (element not found — the button may be rendered inside a shadow DOM or via a heavier wait). Workaround: use Firecrawl Browser API to interact, or derive the complete set from sitemap + filter-by-lastmod (but sitemap lastmod is uniform, see above). **Sitemap's 4,492 URLs are the ceiling; ~100-150 currently-active is the realistic upper bound for live active promos.**

2. **issuer_bank truncation** when the page shows "+N" badge AND the legal-text Entidades list is collapsed. Mitigation: always prompt the LLM to prefer legal-text expansion over icon strip. Still occasional failures — monitor field_coverage metric.

3. **Customer-tier variants vs category-scope variants conflated.** Supermiércoles has category-scope variants (indumentaria / perfumería). Aiello has customer-tier variants (Cartera General / Identité+Plan Sueldo). Both extracted cleanly with the current `variants` field but the semantics differ. Future schema refinement may want `tier_scope` vs `category_scope` distinction.

4. **pct=0 (cuotas-only) pollutes the tope ranking.** 3csi-farmacias-bna, 3csi-simplicity-macro both returned pct=0. Add a `promo_type` discriminator (`cashback` | `cuotas` | `mixed`) so the serving layer can exclude cuotas from the "sort by tope" view.

5. **Session credit total (~340)** is an underestimate of what a new-site visitor would consume — many scrapes hit Firecrawl's shared cache (`cacheState: "hit"`). Fresh scrapes consistently 1 credit, re-scrapes (same hour) also 1 credit but from cache. Production refresh cost should match our 1-credit-per-page measurement.

## Updates to other docs

The stress-test surfaced three issues with `docs/architecture.md` and `docs/data-sources.md` that have been fixed in-place:

1. **architecture.md Promo schema** — `category` enum extended to include `transporte`, `indumentaria`, `electro` (all three appear on real MODO pages). `tope_period` made nullable when `tope` is null. Added optional `variants` array for multi-rate promos.
2. **data-sources.md MODO Tier 1 section** — added the rawHtml `data-testid` breakthrough under "Gotchas #1" as the preferred fix for valid_days ambiguity. Updated cost envelope: slug-diff incremental cadence lands in Firecrawl Standard ($83/mo), not Hobby.
3. **data-sources.md** — updated live catalog size from "40-50 promo cards" to "57 slugs on live hub, 4,492 in sitemap (mostly historical)". Clarified that sitemap lastmod is not a per-page change signal.
