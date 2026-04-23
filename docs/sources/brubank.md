# Brubank — Source Guide

Phase 3.2 wallet source. Shipped 2026-04-19.

## What this source covers

- **Wallet**: Brubank (digital bank, Argentina).
- **URL**: `https://brubank.com/beneficios` — single Webflow static page.
- **Merchants**: ~70–90 brand cards per month (observed 85 on first live run, 2026-04-19). Mix of gastronomia (Burger King, Cerini, Freddo, Havanna, Le Pain Quotidien, Rapanui, Deniro, Molina), combustible (Axion Energy, App YPF), farmacia (Farmacity, Farmalife, Biomac), indumentaria (Simplicity, Get The Look, Vuena, Mala Peluquería, Kusta Barber), electro/education (Educación IT, Baires IT, CUI, Multipoint), and long tail "otro" (Club Newman, Open Park, Natura, Avon, etc.).
- **Data shape**: fixed-label card format — `NN% de reintegro / Tope de reintegro: $N.NNN / <day phrase>`. Day phrase is one of: "Todos los días", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Lunes y viernes", "Lunes a viernes", "Jueves a domingos", "Viernes, sábados y domingos", "Domingo y lunes".
- **Region scope**: national. `valid_regions: []`.

## Endpoints scraped

| URL | `kind` | Refresh | Credits |
|---|---|---|---|
| `https://brubank.com/beneficios` | `bulk` | Weekly | 1 Firecrawl / run |

## Canonical id strategy

```
id = uuidV5(`${source_url}#${plan}#${merchant}#${pct}#${days-label}`, BRUBANK_NAMESPACE)
```

- `plan` (one/plus/ultra) is **mandatory** in the tuple — the same merchant appears under multiple tiers with different pct and tope (Axion Ultra 30% / $6k, Axion Plus 20% / no tope, Axion One 10% / no tope). Without `plan` these would collide.
- `pct` + `days-label` handle the rare multi-rate same-tier case (not observed on the live corpus but defensive).
- Stable across re-runs; monthly catalog refreshes UPSERT in place (zero inserts / N updates on re-run, confirmed).

## Plan-tier modeling decision

Brubank has three subscription tiers (One free / Plus $14.000 / Ultra $29.900), each with tier-specific benefits. The canonical `Promo` schema doesn't have a `required_plan` field.

**Choice**: encode tier in `issuer_bank`:
- Plan Ultra → `issuer_bank: ['brubank-ultra']`
- Plan Plus → `issuer_bank: ['brubank-plus']`
- Plan One → `issuer_bank: ['brubank-one']`

**Rationale**:
- Zero migration required; `issuer_bank` is `z.array(z.string())` with no enum constraint, so custom tier strings are accepted.
- UI can filter on `issuer_bank contains 'brubank-ultra'` trivially.
- The competing alternatives were either (a) a new `required_plan` column with a migration, or (b) emitting one row per tier via `variants[]`. Both add schema surface for one source; option (a) has the highest long-term cost, (b) is messy.

**Trade-off**: `issuer_bank` loses its semantic ("the bank that issued the card"). The cost is cosmetic — downstream queries already treat `issuer_bank` as a multi-value attribute tag.

**Alternative path (if we ever need it)**: add a `required_plan text[]` column. Migration shape = `alter table promos add column required_plan text[];`. Not done now because no consumer needs it.

## Cuotas-sin-interés cards

The top of the page has a "Hasta N cuotas sin interés" ribbon (Nike 6 cuotas, Samsung 12, JBL 12, Aerolíneas 12, Despegar 12, Decathlon per-tier 6) that applies to ALL plans. The prompt handles this with `plan="all"` which fans out into three Promo rows (one per tier) with `pct=0` and `promo_type='cuotas'`. These are NOT included in the first live run's fixture because the model elected to encode Decathlon under `plan="one"` etc.

## Fixtures saved

- `scripts/samples/long-tail/wallets/brubank/beneficios.md` — Firecrawl markdown (2026-04-18 capture).
- `scripts/samples/long-tail/wallets/brubank/beneficios.extract.json` — hand-curated known-good LLM payload (8 promos covering one/plus/ultra, Todos los días / single-weekday / ranges / no-tope).

## Edge cases discovered

- **Plan tier interpretation**: the page layout puts cards under three section headings. The LLM MUST classify by surrounding section, not by card text — we rely on the prompt's "Do NOT copy the card's inner text — use the surrounding section heading" instruction. If the Webflow layout reshuffles sections (breaking order), the classification silently regresses. Monitor.
- **Day phrase "Jueves a domingos"** → `[0, 4, 5, 6]`. The Sunday=0 convention is non-obvious; the prompt lists every mapping explicitly.
- **"App YPF" vs "YPF"**: Brubank uses "App YPF" to distinguish the in-app purchase vs at-the-pump. Both should map to category `combustible`.
- **Same merchant, different rate per plan**: Axion Ultra 30% / Axion Plus 20% / Axion One 10%. Three distinct rows; no merging.
- **"% de descuento" vs "% de reintegro"**: Brubank uses both. "descuento" → direct in-store discount. "reintegro" → cashback. Prompt captures the distinction via `promo_type: "mixed"` vs `"cashback"`.
- **Low tope coverage**: on the live corpus, only 12/85 promos had a tope line. This is the Webflow page's fault — Plan Plus / Plan One cards omit the tope line on the card (it's in the T&Cs article instead). We preserve `tope: null` when the card lacks it rather than inventing a value.

## Known gaps

- **Plan Plus / Plan One topes** are in the `help.brubank.com` T&C articles linked from each card, not on the card itself. Not extracted in this phase. Could add a second pass that follows the deep link for high-value merchants (supermercados, combustible) — deferred.
- **"Ver más" pagination**: the page is one long scroll with no real pagination; we scrape the entire thing. No known gap here.
- **Monthly catalog rotation**: new merchants may join; old ones drop. The TTL pattern (`last_seen_at`) handles drop-off via the soft purge horizon (3 days by default, bumped via the runner). Fresh merchants get picked up automatically.

## Good assertions for the testing agent

These are starter suggestions — the testing agent is free to research more:

- [ ] Live run produces ≥50 promos across all three plan tiers (lower bound from April 2026 corpus).
- [ ] Every emitted Promo has exactly one `issuer_bank` value, matching `^brubank-(one|plus|ultra)$`.
- [ ] "Axion Energy" merchant appears in at least two tiers (was three in April 2026 — Ultra/Plus/One).
- [ ] Canonical-id determinism: re-running against the SAME fixture yields identical ids.
- [ ] `plan="all"` fan-out: a stubbed cuotas-sin-interés card with `plan="all"` creates exactly three rows (one per tier).
- [ ] Idempotency: a second live run produces 0 inserts / N updates (not a fresh N inserts).
- [ ] Schema gate: feed a malformed promo (invalid category, out-of-range weekday) and assert it's rejected with a clear reason, not silently upserted.
- [ ] Day-phrase parsing: "Jueves a domingos" → [0, 4, 5, 6] (the rollover is tricky). Synthesize a card and assert the mapping.
- [ ] "App YPF" vs "Axion Energy" both map to `category: combustible`.
- [ ] The top cuotas-sin-interés ribbon cards emit `pct=0` and `promo_type='cuotas'`.

## Gotchas / debugging notes

- **Gemini `maxOutputTokens: 8192`** is required (not the default 2048). 85 promos in one payload exceeds 2048 tokens; the first benchmark run truncated at ~30 cards. If a future refresh silently drops promos (check `scrape_runs.promo_count` plummet), bump this first.
- **`thinkingBudget: 0`** is critical per `scripts/lib/gemini.ts`. The catalog size makes any "thinking" budget trigger the truncation issue.
- **Webflow cache**: Brubank's static page can be cached by Firecrawl up to ~6 hours (observed `cacheState: hit` on repeat scrapes). For a fresh snapshot add `maxAge: 0` in Firecrawl options (not currently wired; low priority).
- **Live run cost**: ~$0.024 Gemini / 1 Firecrawl credit / ~50s. Cheap. Monthly refresh budget < $0.50.

## Live smoke results (2026-04-19)

- First run: 85 inserted, 0 errored, $0.0239 Gemini, 49.5s.
- Idempotency: 0 inserted / 85 updated, $0.0239 (same prompt is deterministic → same upserts).
- Plan distribution: Ultra 18 / Plus 24 / One 43.
- Tope coverage: 12/85 (Ultra tier cards only).

## valid_to invariant (Phase 3.3, 2026-04-18 root-cause fix)

Brubank's `/beneficios` is a rolling Webflow catalog of ongoing benefits; the
page does NOT declare a per-card vigencia. The original prompt told the LLM
to emit `valid_to = last day of current month`, so the extractor produced a
hallucinated date for every row. The `valid_to >= today` gate in
`src/lib/queries.ts` then correctly hid every row once the scraping month
rolled over — surfacing as "0 of 85 fresh Brubank rows visible" on
2026-04-18.

**Semantic truth**: when the source page does not publish an end date, the
Promo's `valid_to` must be `null`. Null means "no declared end" and passes
the serving-layer gate (SQL: `valid_to is null or valid_to >= today`).

**Fix**: two layers of defence.

1. **Prompt**: tightened to instruct null emission unless one of these
   markers appears: "Vigencia hasta DD/MM/YY", "Válido hasta DD/MM/YY",
   "Hasta el DD/MM/YY", "Hasta el DD de <mes>", "Vigencia Del DD/MM/YY
   al DD/MM/YY".
2. **Runtime guard (Option B, evidence-based)**: the extractor scans the
   source markdown with `markdownDeclaresEndDate()`. If NO end-date markers
   are present anywhere on the page, the guard forces `valid_to = null`
   across the whole payload regardless of what Gemini returned. If markers
   ARE present, the LLM's per-row decision is trusted (it can still emit
   null for rows the marker doesn't cover).

Why Option B instead of unconditional null (Option A): if Brubank ever
publishes a seasonal card with an explicit vigencia, we want to preserve
that signal. Why Option B instead of prompt-only (Option C): a prompt
regression or LLM hallucination could silently re-surface the bug. The
runtime guard is a hard floor.

**Live smoke (2026-04-19 re-run post-fix)**:
- 85 promos ingested as before.
- All 85 rows have `valid_to = null` (the real Webflow page has no markers).
- All 85 pass the serving-layer `valid_to` gate → visible in production.

Schema change: `scripts/promo-schema.ts`'s `valid_to` is now
`z.string().date().nullable()` (was non-nullable). Migration 007 drops the
DB-level NOT NULL constraint. Forward-only; existing non-null rows are
unaffected.

Test coverage: `scripts/tests/brubank-valid-to-invariant.test.ts` locks in
the invariant. Asserts the runtime guard nulls hallucinated dates on the
real fixture, preserves legitimate dates when the page declares them, and
roundtrips LLM null emissions.

## Tests added (Phase 3.3, testing agent)

Added by the testing agent on top of the three minimum smoke tests in
`scripts/tests/brubank-extract.test.ts`:

- `scripts/tests/brubank-regressions.test.ts` (19 tests): canonical-schema walk
  over the fixture, plan-tier `issuer_bank` invariant (`^brubank-(one|plus|ultra)$`),
  day-phrase corner cases (Jueves a domingos → [0,4,5,6], etc.), canonical-id
  determinism + cross-plan distinctness + merchant-casing normalization,
  malformed LLM row rejection (category/tope_period/valid_days/pct) collected
  in `rejected_reasons` rather than crashing the run, duplicate-emission dedup,
  plan='all' fan-out emits three distinct ids, idempotency, 15k-token envelope.
- `scripts/tests/brubank-source.test.ts` (8 tests): `kind === 'bulk'`, listUrls
  shape + override, full pipeline through `runSource` with stubbed Firecrawl +
  Gemini + DB, idempotency (0 inserts on re-run), bulk policy (hash-compare
  skip does NOT fire), empty-markdown handled as errored, schema-violating
  Gemini row degrades gracefully (good rows still upsert), dry-run prints the
  URL without scraping or upserting.
- `scripts/tests/wallet-enum-parity.test.ts` (4 tests, cross-cutting): Zod
  wallet enum vs `src/lib/constants.ts` `WALLET_SLUGS` / `WALLET_LABELS` parity,
  all Phase 3 wallet additions present.
