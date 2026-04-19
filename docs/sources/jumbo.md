# Source: Jumbo (`jumbo-descuentos`)

Phase 3.3 supermarket-native cross-bank catalog. `kind: 'bulk'`, multi-URL.

## Coverage

- **Merchants**: Jumbo (Cencosud supermarket chain; national)
- **Banks**: galicia, macro, santander, patagonia, nacion, comafi, cencopay (Cencosud's own card), naranjax, supervielle, ciudad
- **Wallets**: modo, mercadopago, **jumbo_mas** (Jumbo+ loyalty — the Jumbo al 100 pesoscheck wallet; PromoArg differentiator)
- **Region scope**: National
- **Categories**: always `supermercado`

## Endpoints

| URL | `kind` | Notes |
|---|---|---|
| `https://www.jumbo.com.ar/descuentos-del-dia` | bulk | Cross-bank catalog. Filters by `?type=por-dia&day=N`; Firecrawl lands on today's day by default. **Promos NOT on today's day filter are hidden** — see "Known gaps" below. |
| `https://www.jumbo.com.ar/jumbo-al-cien` | bulk | Own-cupon pesoscheck program. **One promo row per run** with `wallet: ['jumbo_mas']` and `pct: 100`. Monthly rotation (emission + canje windows). |

Both URLs carry their own rows; no cross-URL dedup.

## VTEX dataentity note

Jumbo IS VTEX (`generator: vtex.render-server@8.179.3`) but we did not probe its promo dataentity — we did probe Carrefour's BP dataentity (auth-gated). Jumbo's promo content surfaces cleanly in markdown, so no API alternative was explored. Worth a Phase 4 pass if credit budget tightens.

## Canonical id strategy

Same tuple as Coto: `(source_url, day_key, bank_key, pct, promo_type)`. For the Jumbo al 100 row specifically, `bank_key = '_none_'` (no bank involved, wallet-only).

Monthly slug rotation note: `jumbo-al-cien` URL path is STABLE; only the emission/canje date ranges in the content rotate. The id tuple doesn't include dates, so re-runs UPDATE the single pesoscheck row in place — intended.

## Fixtures

- `scripts/samples/long-tail/super/jumbo/descuentos-del-dia.md` — scraped 2026-04-18 (day filter defaulted to Saturday)
- `scripts/samples/long-tail/super/jumbo/descuentos-del-dia.extract.json` — representative LLM payload
- `scripts/samples/long-tail/super/jumbo/jumbo-al-cien.md` — scraped 2026-04-18 (March 2026 cycle visible; documents the structure)
- `scripts/samples/long-tail/super/jumbo/jumbo-al-cien.extract.json` — single-row pesoscheck fixture

## Edge cases discovered

- **Multiple cuotas-count rows on the same bank** — Cencopay shows 3-cuotas, 6-cuotas, 12-cuotas, 18-cuotas, 24-cuotas as separate blocks with the same bank/day. Each extracts as a distinct row with `pct: 0, promo_type: 'cuotas'`. **They currently collide in the id tuple** because `pct: 0` is the same for all of them. This is a known gap in the current id scheme — Phase 4 should add cuotas-count to the tuple. For Phase 3.3, the first-seen row wins and subsequent cuotas-only rows are deduped out.
- **Patagonia Sábados tiered** — Visa crédito general 30% tope $20k/mes AND 35% supermercado tope $25k/mes are TWO separate rows with same bank+day but different `pct`. Deduped correctly by pct.
- **Cencopay is a Cencosud private-label card** (not a traditional bank). We emit `issuer_bank: ['cencopay']` for consistency; this is a design choice and may want renaming later.
- **Jumbo al 100 monthly rotation** — the scraped March 2026 cycle landed in the fixture. Next run (April or May) will produce an updated row at the same id.
- **Visa/Mastercard brand-only promos** — e.g., "3 cuotas sin interés con Visa y Mastercard bancarias". These have `issuer_bank: []` and `card_brand: ['visa','mastercard']`. The id's `bank_key` resolves to `_none_`.

## Known gaps

- **Per-weekday polling not implemented.** The live `/descuentos-del-dia` page filters to TODAY's weekday by default. Promos exclusive to other days (e.g., Martes-only promos when we scrape on Saturday) are not surfaced. The brief says "build slug-diff awareness into the adapter if it's straightforward; otherwise document it as a follow-up" — we're documenting it as a follow-up. A future `?day=N` loop over 0..6 + per-day merge would give full coverage (≈7 Firecrawl credits/week instead of 2). Phase 4 addition.
- **Cuotas-count collision in id tuple.** Multiple "N cuotas sin interés" rows on the same bank+day collapse to one row (first wins). Fix: extend the tuple with a `cuotas_count` or `promo_variant` field. Not urgent since the wedge is tope-sort (pct=0 rows don't sort on tope).
- **Electro category not split out.** Jumbo frequently has "12 cuotas en Electro" that semantically is `category: 'electro'` but on this chain-wide catalog we tag them `supermercado`. If product wants a filter for "electro financing offers," Phase 4 should branch category via LLM.

## Good assertions for the testing agent

- Every promo has `merchant === 'Jumbo'` and `category === 'supermercado'`.
- Jumbo al 100 row has exactly `wallet: ['jumbo_mas']`, `pct: 100`, `tope: null`, and `valid_from < valid_to` with dates in the same or adjacent month.
- Patagonia Sábados 35% tope $25k/mes validates with `tope_period: 'month'`, `pct: 35`.
- Naranja X Plan Z "3 cuotas sin interés" → `pct: 0`, `promo_type: 'cuotas'`.
- Jumbo al 100's `valid_days` includes weekdays spanning the emission window (the Friday, Saturday, Sunday of the month's first weekend in the March 2026 sample).
- Re-running the pipeline on the same fixture yields identical ids.
- Source object kind is `'bulk'`, `listUrls()` returns both default URLs.
- Rejection path: inject a promo with `tope_period: 'fortnight'` (not in enum) — only that row rejected, others pass through.

## Gotchas / debugging notes

- Firecrawl's URL-resolution silently normalizes the Jumbo URL to `?type=por-dia&day=N` where N is today's ISO weekday. This means the fixture is day-specific. If re-scraping, the content will differ by day of week.
- Jumbo's storefront embeds a Cencosud "Tap to unmute" YouTube block for `/jumbo-al-cien` that Firecrawl's markdown includes; the legal body sits below it. The LLM handles this fine but fixture authors need to keep the legal text in the fixture.
- VTEX SPA requires `waitFor: 5000` — without it, only the top-nav render without the catalog body.
- "Jumbo Madero, Arenales y Comodoro Rivadavia" store exclusions are a Jumbo al 100 caveat. The fixture surfaces this in `notes`; no filtering logic is applied.

## Live smoke results (2026-04-18)

First live run:
- 2 URLs processed (descuentos-del-dia + jumbo-al-cien)
- **14 promos inserted**, 0 errors
- Gemini cost: $0.0127
- Elapsed: 21.4s

Idempotent re-run:
- 0 inserts / 14 updates

PromoArg-differentiator check (live DB):
- `wallet = ['jumbo_mas']` promo: 1 row
  - "Jumbo al 100 pesoscheck — 100% / 70% / 50% reintegro on selected products, Jumbo+ members" — own-cupon PromoArg does not source.
  - `valid_from=2026-03-06`, `valid_to=2026-03-15` (March 2026 cycle; re-running when April cycle publishes will UPDATE the row in place).

## Tests added (Phase 3.3 testing pass)

- `scripts/tests/jumbo-extract.test.ts` (15 tests):
  smoke (both fixtures) + schema conformance + Patagonia Sábados 30% vs 35%
  split into TWO rows with distinct ids + Naranja X Plan Z cuotas row shape
  (`pct=0`, `promo_type='cuotas'`) + Jumbo al 100 pesoscheck row shape
  (`wallet=['jumbo_mas']`, `valid_from < valid_to`) + wallet enum safety +
  id determinism + id shifts on `valid_days` change + intra-page dedup +
  rejection path (invalid `tope_period`) + empty payload + adapter kind/URLs
  + urlOverride.
- Covered by shared-helper tests: `scripts/tests/supermarket-extract.test.ts`.
- Covered by P0 idempotency regression: `scripts/tests/carrefour-idempotency.test.ts`
  includes a parallel drift test for Jumbo.
- Covered by runner-integration tests: `scripts/tests/supermarket-runner.test.ts`
  asserts Jumbo re-run inserts 0 (idempotent).
