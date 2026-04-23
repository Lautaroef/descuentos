# Source: Coto (`coto-descuentos`)

Phase 3.3 supermarket-native cross-bank catalog. `kind: 'bulk'`, multi-URL.

## Coverage

- **Merchants**: Coto (supermarket; single merchant, but many bank promos on the same chain)
- **Banks**: credicoop, ciudad, icbc, nacion, naranjax, macro, galicia, columbia, patagonia, supervielle, santafe, sanjuan, santacruz, entrerios, tci, comafi, ciudadaniaportena, anses, mercadopago
- **Wallets**: modo, mercadopago, naranjax, **comunidad_coto** (own-cupon — this is the PromoArg differentiator)
- **Region scope**: National (most promos). A handful of regional-bank rows (Santa Cruz, San Juan, Entre Ríos, Santa Fe) retain their provincial applicability in practice but the legal text doesn't geo-restrict them, so `valid_regions: []` is the honest model.
- **Categories**: always `supermercado`

## Endpoints

| URL | `kind` | Notes |
|---|---|---|
| `https://www.coto.com.ar/descuentos/` | bulk | Physical-store catalog (day-tabbed UI). ~20 promo blocks rendered flat in markdown. |
| `https://www.cotodigital.com.ar/sitios/cdigi/descuentos` | bulk | E-commerce catalog. ~50 blocks (includes cuotas-only rows for many banks that the physical-store page hides). 404 if probed without Firecrawl's JS hydration — requires `waitFor: 5000`. |

Both URLs carry their OWN rows (no cross-URL dedup) — they represent distinct user-facing surfaces. Phase 4 canonical dedup will collapse equivalents.

## VTEX dataentity note

Not applicable to Coto — Coto's stack is a bespoke CMS (not VTEX). Coto Digital uses a custom framework; no public JSON feed for promos was explored. HTML scraping is the only path.

## Canonical id strategy — v2 (2026-04-23)

`uuidV5(SUPERMARKET_UUID_NAMESPACE_V2, "${source_url}#${day_key}#${banks_key}#${wallets_key}#${pct}#${promo_type}#${variant_key}")`

Rationale:
- `merchant` is constant (always "Coto"), so it can't distinguish rows — drop it from the tuple.
- Multiple Mondays-only 30% promos from DIFFERENT banks need separate ids.
- `day_key` = sorted ISO weekday numbers joined by `,` — e.g., `"3"` for Miércoles, `"1,2,3,4,5"` for L-V.
- `banks_key` = ALL sorted+deduped banks joined by `|` (v2 upgrade; v1 only kept the first alphabetical bank and collided on multi-bank Carrefour blocks that shared a primary).
- `wallets_key` = ALL sorted+deduped wallets joined by `|` — distinguishes Comunidad Coto own-cupon rows from bank-card-only rows cleanly.
- `promo_type` disambiguates a 20% cashback row from a 20% cuotas row on the same bank + day.
- `variant_key` = `cNN` for cuotas rows (the cuotas_count), `TOPE:PERIOD` for cashback/mixed — disambiguates same-bank/day/pct tiers (e.g., "Credicoop 30% cartera general tope $15k" vs "Credicoop 30% sueldo tope $20k" if such a tuple ever appears).

**Trade-off**: When Coto reshuffles (bank drops, day changes), new ids emit — old rows go stale under TTL. Intentional for Phase 3; Phase 4 dedup will merge equivalents.

## Fixtures

- `scripts/samples/long-tail/super/coto/coto-descuentos.md` — scraped from `www.coto.com.ar/descuentos/` 2026-04-18
- `scripts/samples/long-tail/super/coto/cotodigital-descuentos.md` — scraped from `cotodigital.com.ar/sitios/cdigi/descuentos` 2026-04-18
- `scripts/samples/long-tail/super/coto/cotodigital-descuentos.extract.json` — handcrafted LLM-shaped payload for the fixture smoke test

## Edge cases discovered

- **Comunidad Coto own-cupon** — 15% Miércoles sin tope, membership-only. Modelled as `wallet: ['comunidad_coto']` with `issuer_bank: []`. Migration 005 adds this enum value.
- **Segment-tiered topes** — Comafi jueves Visa Electrón 25% has two topes: $13.000 cartera general / $18.000 Segmento Único. The extractor prompt says "take the LOWER (most conservative)" and surfaces the tier as a `notes` string. Honest but lossy — Phase 4 should split this into `variants[]` per the schema.
- **Multi-day promos with explicit date ranges** — e.g., "Del Sábado 18/04 al Lunes 20/04" maps to `[0,1,6]`. The LLM handles this; no special regex.
- **Regional-bank "Sin tope"** — Santa Cruz / San Juan / Entre Ríos / Santa Fe each get their own 30% Lunes promo row. Emit 4 separate rows (their legal text is identical but issuer_bank differs).
- **Cross-day blocks** — "Lunes, Sábado y Domingo" Credicoop tiers (cartera general 30% / sueldo 40%). Two separate rows with the same `day_key="0,1,6"` but different bank tier (surfaced in notes).

## Known gaps

- **`valid_regions` stays `[]` for regional-bank rows** — we don't geo-restrict to the bank's home province because the legal text doesn't (and the bank's customers in CABA might also use the promo). If a user wants "deals in AR-Y", a post-query join on `issuer_bank → province` is the right shape.
- **Variant topes collapsed to single tope** — see Comafi note above. A future improvement is to populate `variants[]`.
- **No vigencia ranges beyond the month** — Coto's legal text often says "Vigencia hasta el 30/04" without giving a start date. We default `valid_from=2026-04-01` from the prompt. A Phase 4 vigencia-aware LLM pass is a good upgrade.

## Good assertions for the testing agent

(Brainstorm — not exhaustive, up to the testing agent which ones matter.)

- Every promo row has `merchant === 'Coto'` and `category === 'supermercado'`.
- Comunidad Coto row has exactly `wallet: ['comunidad_coto']`, `pct: 15`, `tope: null`, `valid_days: [3]`, `issuer_bank: undefined` or `[]`.
- Naranja X Martes splits into TWO rows: Plan Turbo 25% tope $12k AND non-plan 10% tope $3k — both with `day_key="2"`, different `pct`, hence different ids.
- Re-running the extractor twice on the same markdown yields identical `ids` arrays (deterministic).
- Injecting one promo with an invalid `category` value rejects that one row and keeps the rest.
- Bank Santa Cruz + Bank Entre Ríos + Bank Santa Fe + Bank San Juan "30% Lunes sin tope" are FOUR distinct rows, not one.
- `cotodigital-descuentos.md` fixture surfaces cuotas rows (pct=0, `promo_type='cuotas'`) AND cashback rows. Both validate.
- Comafi 25% Jueves `tope: 13000` (lower tier), `tope_period: 'ticket'`, notes contains "Cartera general" or "Segmento".
- ID tuple does NOT include merchant or source_id — proven by synthetic tests that only change `day_key` / `pct` / `bank_key`.

## Gotchas / debugging notes

- `cotodigital.com.ar` returns **HTTP 404 to plain curl** (even with browser User-Agent) but renders fully via Firecrawl with `waitFor: 5000`. It's an SPA; content hydrates client-side. Don't bother with direct HTTP.
- The Cotodigital page repeats many bank promos multiple times (e.g., Macro 12 cuotas Lunes shows up once per day tab). The extractor dedups on the id tuple — intra-URL dedup is handled in `supermarket-extract.ts`.
- "Sin tope" on Coto sometimes appears as "Sin límite de reintegro" or "SIN TOPE DE REINTEGRO" (capitalization varies). The prompt enumerates both forms.
- Credicoop's limited-time promos (e.g., "Valido solo para el Sábado 18/04, Domingo 19/04 y Lunes 20/04") should get their `valid_from`/`valid_to` from the range. This is LLM-best-effort; the test doesn't assert the dates because fixture uses month-default.

## Live smoke results (2026-04-18)

First live run:
- 2 URLs processed (coto.com.ar/descuentos/ + cotodigital.com.ar/sitios/cdigi/descuentos)
- **48 promos inserted**, 0 errors
- Gemini cost: $0.0219
- Elapsed: 39.6s

Idempotent re-run:
- 0 inserts / 48 updates
- Gemini cost: $0.0219 (same, cache miss — Gemini call happened again; the bulk-kind policy re-extracts, upserts are idempotent)

PromoArg-differentiator check (live DB):
- `wallet = ['comunidad_coto']` promos: 2 rows (one per URL)
  - "Coto 15% Miércoles sin tope, todos los medios de pago, siendo miembro" — exactly the own-cupon PromoArg does not source.

## Tests added (Phase 3.3 testing pass)

- `scripts/tests/coto-extract.test.ts` (15 tests):
  smoke + Comunidad Coto own-cupon row shape (`wallet=['comunidad_coto']`,
  empty `issuer_bank`, `pct=15`, `valid_days=[3]`) + Naranja X Martes
  Plan-Turbo vs non-Plan-Turbo split into TWO rows with distinct ids +
  regional-bank fan-out (Santa Cruz sin-tope) + Credicoop cartera-general
  vs Plan-sueldo split + schema conformance + wallet-enum safety +
  Comafi Jueves tope = lower cartera-general value + adapter kind/URLs
  + intra-page dedup + rejection path (invalid category, invalid date) +
  empty-payload resilience.
- Covered by shared-helper tests: `scripts/tests/supermarket-extract.test.ts`.
- Covered by P0 idempotency regression: `scripts/tests/carrefour-idempotency.test.ts`
  includes a parallel drift test for Coto.
- Covered by runner-integration tests: `scripts/tests/supermarket-runner.test.ts`
  asserts Coto re-run inserts 0 (idempotent).
