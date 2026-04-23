# Source: Carrefour (`carrefour-descuentos-bancarios`)

Phase 3.3 supermarket-native cross-bank + cross-wallet catalog. `kind: 'bulk'`, single URL.

## Coverage

- **Merchants**: Carrefour (including Carrefour Hipermercado, Carrefour Market, Carrefour Express, Carrefour Maxi — collapsed to one merchant)
- **Banks**: bbva, galicia, santander, nacion, icbc, patagonia, comafi, supervielle, ciudad, credicoop, macro, columbia, **carrefour** (Carrefour Banco — the chain's own bank)
- **Wallets**: modo, mercadopago, cuentadni, uala, naranjax, personalpay, bna_plus, prex, **mi_carrefour** (own loyalty — PromoArg differentiator)
- **Region scope**: National
- **Categories**: always `supermercado`

## Endpoints

| URL | `kind` | Notes |
|---|---|---|
| `https://www.carrefour.com.ar/descuentos-bancarios` | bulk | ~30 promo blocks across 7 days + "Todos los días". Includes the universal cross-wallet "10% con QR de todas las billeteras" block. |

## VTEX dataentity investigation (mandatory per the brief)

**Finding: dataentity `BP` is auth-gated. HTML fallback required.**

Probe transcript (2026-04-18, `curl` with browser User-Agent):

| Endpoint | Status | Notes |
|---|---|---|
| `/api/dataentities/BP/search?_fields=id` | 200 | Returns an array of UUIDs for every record. Only `id` is publicly readable. |
| `/api/dataentities/BP/search?_fields=_all` | 403 | `{"Message":"Cannot read private fields"}` |
| `/api/dataentities/BP/search?_fields=name` | 403 | Same. Also tried `title`, `description`, `day`, `percent`, `pct`, `bank`, `banco`, `tope`, `vigencia`, `discount`, `porcentaje`, `tarjeta`, `billetera`, `wallet`, `dias`, `image`, `logo`, `bannerPrincipal`, `label`. ALL 403. |
| `/api/dataentities/BP/documents/<uuid>` | 403 | Same private-fields error. |
| `/api/dataentities/BP/documents/<uuid>?_fields=id` | 200 | Only `id` readable. |
| `/api/dataentities/BP/documents/<uuid>/img_card_1/attachments/modo.png` | 403 | Attachments also auth-gated. |
| `/api/dataentities/BP/schemas` | 403 | Schema list auth-gated. |

Conclusion: the BP dataentity IS the backing store for the promo catalog (confirmed via the image URL pattern `/api/dataentities/BP/documents/{uuid}/img_card_N/attachments/<wallet>.png` visible in the HTML scrape), but its content is private. Only `id` is readable. **We cannot bypass HTML scraping.** The probe cost was 0 Firecrawl credits (plain `curl`).

If Carrefour ever opens the BP schema publicly (or if a logged-in token becomes reliably available), revisit — a JSON feed would save ~1 Firecrawl credit/run and give us structured fields without LLM inference. For Phase 3.3 the HTML path is the right choice.

## Canonical id strategy — v2 (2026-04-23)

Same as Coto/Jumbo: `(source_url, day_key, banks_key, wallets_key, pct, promo_type, variant_key)`.

- `banks_key`: ALL sorted+deduped banks joined by `|` (or `_none_`).
- `wallets_key`: ALL sorted+deduped wallets joined by `|` (or `_none_`).
- `variant_key`: `cNN` for cuotas rows, `TOPE:PERIOD` for cashback/mixed, empty if no tope.

**Cross-wallet universal promo handling**: Carrefour's "10% sin tope con QR de todas las billeteras" legal body lists 8+ wallets sharing identical terms. Per the brief: emit ONE Promo row with `wallet` as an array of all listed wallets, NOT N separate rows. Under v2, the `wallets_key` captures this composition so the universal block has a distinct id from any single-wallet variant.

**Multi-bank identical-terms promos** get the same treatment: one row with `issuer_bank: ['bbva','galicia','santander',...]` rather than N rows. Under v1, the id's `bank_key` was the FIRST sorted bank — so two multi-bank promos sharing `bbva` as first-alphabetical would collide. Under v2, `banks_key` is the FULL sorted list joined by `|`, preventing collisions.

## Extraction architecture — chunked (2026-04-23)

The live /descuentos-bancarios page has grown to ~30 promo blocks with long exclusion legal bodies (bodega lists, product exclusions). On 2026-04-23, a single Gemini call for the full page hit `maxOutputTokens` and truncated mid-string:
  `Gemini returned non-JSON text (Unterminated string in JSON at position 25862)`.

**Long-term fix**: `buildCarrefourChunker` in `scripts/lib/carrefour-extract.ts` splits the markdown at "Ver legal" boundaries (one per block), grouping 2 blocks per chunk. Each chunk becomes a separate Gemini call (concurrency 4). Output tokens per call drop from ~6k to ~700, well under the 2048 ceiling. The shared `extractSupermarketPromos` helper merges per-chunk payloads and surfaces per-chunk telemetry (`chunks_total`, `chunks_succeeded`, `chunk_errors`).

Trade-off analysis:
  - **Chosen: section-chunking** (Option 1). Parallel, bounded per-call, source-specific boundary detection via an existing "Ver legal" marker already in the raw markdown.
  - **Not chosen: two-pass** (Option 2). 2N LLM calls instead of N/k; ~2x more expensive for no quality improvement.
  - **Not chosen: streaming / resume** (Option 3). Complex resume logic; error-prone.
  - **Not chosen: bump `maxOutputTokens` only** (Option 4). Defers the problem; catalogs grow over time. Kept as single-chunk fallback at 8192 tokens when the chunker can't find delimiters.
  - **Not chosen: per-promo extraction** (Option 5). Requires reliable per-promo boundary detection at the TS layer, which is brittle when the markdown has marketing banners.

## Fixtures

- `scripts/samples/long-tail/super/carrefour/descuentos-bancarios.md` — Firecrawl scrape 2026-04-18, cleaned of embedded VTEX JS blob
- `scripts/samples/long-tail/super/carrefour/descuentos-bancarios.extract.json` — 4-row representative LLM payload (includes the universal cross-wallet row)

## Edge cases discovered

- **Universal cross-wallet promo** (the headline differentiator) — one block lists CARREFOUR BANCO, MERCADO PAGO, CUENTA DNI, MODO, NARANJA X, UALÁ, BNA+, PERSONAL PAY, PREX as participating wallets for `10% sin tope`. Emitted as ONE row with `wallet: [8 slugs]`. Test asserts the row exists with `wallet.length >= 5`.
- **Mi Carrefour own loyalty** — referenced in multiple blocks. Modelled as `wallet: ['mi_carrefour']`. Migration 005 adds this enum.
- **Carrefour Banco Cuenta Digital** — a bank-only promo (no separate wallet). `issuer_bank: ['carrefour']`, `wallet: []`. The bank is the chain's own retail bank (Banco de Servicios Financieros S.A.).
- **Embedded VTEX JS blob** — the raw Firecrawl markdown for `/descuentos-bancarios` includes a ~50KB single-line JS/CSS blob from VTEX's React hydration runtime. `cleanCarrefourMarkdown()` in `carrefour-source.ts` strips any line > 5000 chars. Without this, the Gemini prompt would bloat by ~15k tokens of garbage.
- **Electro Black banner** — a top-of-page banner says "ELECTRO BLACK! Hasta 30% OFF" — this is marketing, not a bank promo, and the prompt explicitly tells the LLM to skip it.
- **"Todos los Sábados y Domingos" phrase variance** — the legal text sometimes says "TODOS LOS SÁBADOS Y DOMINGOS", sometimes "FINES DE SEMANA DE ABRIL". Both map to `[0, 6]`.

## Known gaps

- **Per-user Mi Carrefour cupones are app-locked.** The brief explicitly says "Mi Carrefour per-user cupones stay manual / press-only" — we do NOT try to surface them here. The "mi_carrefour" wallet enum captures Carrefour's PUBLIC loyalty benefits only (the "Todos los Sábados y Domingos: 10% con Mi Carrefour" block that shows up on the catalog).
- **Marketplace seller legal text** — some blocks mention "NO APLICA A PRODUCTOS VENDIDOS POR DISTRIBUIDOR/FABRICANTE" but we don't model that exclusion. If a user filters by "toda la compra only", they'll get some false positives. Phase 4 exclusions field.
- **Vigencia trusted from legal text, not label** — the label says "Todos los Jueves de Marzo" but the legal body says "TODOS LOS JUEVES DE ABRIL 2026". The prompt instructs the LLM to trust the legal body. Fixture asserts this.

## Good assertions for the testing agent

- Every promo has `merchant === 'Carrefour'` and `category === 'supermercado'`.
- The universal 10%-QR row has `wallet.length >= 5` AND includes all of `['cuentadni','personalpay','bna_plus','prex']`.
- The universal row has `tope: null`, `pct: 10`, `valid_days: [0, 6]`.
- Cuenta Digital de Carrefour Banco row has `issuer_bank: ['carrefour']`, `wallet: []`, `tope: 10000`, `tope_period: 'week'`.
- Mercado Pago "3 cuotas sin interés" row has `pct: 0`, `promo_type: 'cuotas'`, `wallet: ['mercadopago']`, `issuer_bank: []`, `tope: null`.
- `cleanCarrefourMarkdown()` drops any line ≥ 5000 chars and preserves short lines.
- Inject a deliberately malformed row (e.g., category="food") — only that row rejects; others pass.
- Re-runs yield identical ids.
- Injecting two rows that distill to the same id tuple (e.g., same day + pct + primary bank) yields only one row in the output (intra-run dedup).

## Gotchas / debugging notes

- The `/descuentos-bancarios` markdown has a giant embedded VTEX hydration JS/CSS blob on one line — strip before passing to Gemini.
- Carrefour sometimes reuses the same bank logo across multiple promo blocks (e.g., Banco Patagonia appears 28x in the HTML). Dedup by content tuple, not by image URL.
- Legal text capitalization is inconsistent ("SIN TOPE" vs "sin tope" vs "Sin Tope"). Prompt is case-insensitive.
- The BP dataentity img_card URLs are informative for debugging what bank/wallet is attached to a block — e.g., `/img_card_3/attachments/cuenta-dni.png` tells us Cuenta DNI is the 3rd wallet in the card. But we don't rely on this; the legal body is authoritative.

## Live smoke results (2026-04-18)

First live run:
- 1 URL processed (/descuentos-bancarios)
- **25 promos inserted**, 0 errors
- Gemini cost: $0.0249
- Elapsed: 56.2s

Idempotent re-run:
- 1 insert / 24 updates (near-idempotent; the 1 new insert is Gemini nondeterminism at the token boundary — an alt valid_days ordering or pct rounding shifted the id tuple on one row. 24/25 deterministic is acceptable for Phase 3; Phase 4 canonical dedup will collapse the alt row).
- Gemini cost: $0.0236

PromoArg-differentiator check (live DB):
- Universal cross-wallet 10% sin tope (Sábados):
  - `wallet = ['bna_plus','cuentadni','mercadopago','modo','naranjax','personalpay','prex','uala']` (8 wallets in one row)
  - `issuer_bank = ['carrefour']`
  - `pct=10`, `tope=null`, `valid_days=[6]`
  - Exactly the single-promo-multi-wallet shape the brief calls for.

## Tests added (Phase 3.3 testing pass)

### P0 regression — idempotency flake fixed
- Root cause (verified): `supermarketPromoId()` consumed `pct` and `valid_days`
  directly from Gemini's output, without integer rounding or dedup. On drift
  runs where Gemini emitted `10` vs `10.0` (structured-output float jitter) or
  `[6]` vs `[6, 0, 6]` (token-boundary array duplication), the canonical UUID
  changed and the DB saw "1 insert / 24 updates" on re-run.
- Fix: `scripts/lib/supermarket-extract.ts`
  - `dayKey()` now dedupes + sorts + guards range.
  - `primaryBank()` dedupes + lowercases defensively.
  - `supermarketPromoId()` now rounds `pct` to integer (`canonicalPct`),
    lowercases+trims `bank_key` and `promo_type` (`canonicalPromoType`).
- Regression test path:
  - `scripts/tests/carrefour-idempotency.test.ts` — stubbed Gemini drift
    (pct floats, duplicated `valid_days`, uppercased banks) must produce
    byte-identical `ids` across back-to-back extractions.
  - `scripts/tests/supermarket-runner.test.ts` — runner end-to-end with the
    same shape: `run2.inserted === 0` on re-run.

### Carrefour coverage
- `scripts/tests/carrefour-extract.test.ts` (19 tests):
  smoke + schema conformance + cross-wallet row shape + `cleanCarrefourMarkdown`
  edge cases (empty, threshold boundary, blank-line collapse) + id
  determinism + intra-page dedup + rejection path (invalid category /
  tope_period) + empty-payload resilience + adapter shape.
