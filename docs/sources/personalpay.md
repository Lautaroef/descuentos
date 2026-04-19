# Personal Pay — Source Guide (PARTIAL COVERAGE)

Phase 3.2 wallet source. Shipped 2026-04-19.

**Coverage status: PARTIAL.** Topes are documented as null because the public web surface does not expose them and the backing API is auth-gated. This is honest modelling, not a bug.

## What this source covers

- **Wallet**: Personal Pay (Telecom Argentina fintech wallet).
- **URL**: `https://www.personalpay.com.ar/beneficios` (301 → `https://www.personal.com.ar/pay/beneficios`).
- **Merchants**: ~96 partners across 8 paginated hub pages. First live run captured 10 merchants (the first page only; see "Known gaps" below for the pagination story).
- **Data shape**: each card has merchant name + pct badge + day phrase. **Topes are NOT on the cards** — they live in a summary image (`Desk_tabla_v2.webp`, Nivel 1/2/3 tier table).
- **Region scope**: national. `valid_regions: []`.

## Endpoints scraped

| URL | `kind` | Refresh | Credits |
|---|---|---|---|
| `https://www.personalpay.com.ar/beneficios` | `bulk` | Weekly | 1 Firecrawl / run |

## Canonical id strategy

```
id = uuidV5(`${source_url}#${merchant}#${pct}#${days-label}`, PERSONALPAY_NAMESPACE)
```

Same tuple as Naranja X. Stable across re-runs.

## The big PARTIAL: why topes are null

Personal Pay's wallet uses a tier-based tope structure (Nivel 1 / Nivel 2 / Nivel 3, unlocked by previous-month spend ≥ $150.000). The tope-per-merchant ceilings are rendered into a summary IMAGE, not into the card text.

**Investigations done (documented so future agents don't re-walk this):**

1. **OCR the image?** Firecrawl doesn't OCR natively. Adding an OCR hop (Gemini Vision / Google Cloud Vision) is out of scope for Phase 3.2 and would require a separate pipeline + schema.
2. **Probe the `beneficiosclub.personalpay.dev` subdomain** (the CDN referenced in card `<img>` URLs). Result: it's a CRA app that hits the AWS API Gateway at `https://a06k96u4je.execute-api.us-east-1.amazonaws.com/prod/club-personal/back-office`. All probed paths (`/partners`, `/beneficios`, `/list`, `/categories`, `/api/v1/partners`) return **401 Unauthorized** or **403 Forbidden**. It's the authenticated back-office for Personal Pay operators, not a public partner catalog feed.
3. **Press triangulation?** iProUp / promociones.com.ar publish monthly combo articles with Nivel 3 topes ("20% super/combustibles tope $8.000", "$3.500 factura Flow/Personal"). That's the cleanest path — NOT implemented in Phase 3.2; could be a future `personalpay-press-source.ts` analog of `cuenta-dni`. Flagged.

**Decision**: Ship the source with `tope: null` + `tope_period: null` for every row. The prompt explicitly instructs the LLM NOT to invent topes — and the fixture smoke test enforces this (asserts all emitted rows have `tope=null`).

**Alternative considered**: Defer the whole source. Rejected because the web surface DOES give us ~96 merchant × pct × days data points — that's valuable input for a "PersonalPay has <merchant>" filter even without topes. The "sort by tope" wedge simply excludes these rows (tope IS NULL → NULLS LAST, which is already the default sort).

## Fixtures saved

- `scripts/samples/long-tail/wallets/personalpay/beneficios.md` — hub page markdown (2026-04-18 capture).
- `scripts/samples/long-tail/wallets/personalpay/beneficios.extract.json` — known-good LLM payload with all topes null.

## Edge cases discovered

- **Pagination**: the hub has 8 pages (visible via the paginator strip: `- 1 - 2 - 3 - 4 - 5 - … - 8`). Firecrawl's default scrape returns page 1 only. Page 2+ requires either (a) Firecrawl's `actions: [{type: 'click'}]` (unreliable on AEM), or (b) direct pagination via URL params if the page uses them (not observed — the paginator seems to be pure client-state).
  - **Live smoke extracted 10 merchants** (page 1). Full catalog is ~96 merchants.
- **Repeated "Personal Flow" entries** (the wallet's own phone-service merchant appears 3× with different rates — 25%, 10%, 10%). The dedup layer (`seenIds`) would collapse them if their (merchant, pct, days) tuple matched. With differing pcts they survive as distinct rows, as intended.
- **Day phrase "Lunes, Martes"** → `[1, 2]`. Prompt handles explicit comma lists.
- **Day phrase "Lunes a Miércoles"** → `[1, 2, 3]`. Range pattern.
- **The `beneficiosclub.personalpay.dev/partner/<slug>.png` CDN** is used for partner logos only. Not scraped, not OCRed.

## Known gaps (honest accounting)

1. **Topes are null for every row.** Press triangulation is the future path.
2. **Only page 1 of the paginated hub is extracted.** Full catalog requires either Firecrawl Browser API pagination or the auth-gated AWS API. Current rows = first 10-12 merchants (highest-priority partners by the page's sort).
3. **No plan-tier (Nivel 1/2/3) signal.** The tier determines the tope ceiling, but we don't have topes anyway, so the tier data would be orphan. Future press-triangulation pass picks up both simultaneously.
4. **`requires_min_spend` is NEVER populated** even though Nivel 3 unlocks at $150.000 previous-month spend. That's an account-level threshold (required to USE the benefit), not a per-promo minimum. The Zod field has the wrong semantic for it; not extracted.

## Good assertions for the testing agent

- [ ] Every emitted Promo has `tope === null` and `tope_period === null`. **This is the invariant**; if the LLM ever starts hallucinating topes, the fixture test catches it.
- [ ] `personalpayPromoId` deterministic + distinct across (merchant, pct, days) permutations.
- [ ] Live run produces ≥5 promos (lower bound — even page 1 alone is 10+).
- [ ] Idempotency: 0 inserts / N updates on second run.
- [ ] Day-phrase parsing corner cases: "Lunes a Miércoles" → `[1,2,3]`, "Lunes, Martes" → `[1,2]`, "Fin de semana" → `[0,6]`.
- [ ] Schema-level invariant NOT enforced (the `Promo` schema allows non-null tope). This is intentional — the invariant is prompt-level + fixture-level. The testing agent may choose to add a schema-level guard (`z.refinement` on `source_id === 'personalpay' → tope === null`), but the trade-off is future press-triangulation changes would need a schema update.
- [ ] A hallucinated tope slipping through the Zod gate is silently upserted (because Zod accepts it). The fixture test catches this via the `tope === null` assertion, NOT the schema gate.

## Gotchas / debugging notes

- **The short URL `personalpay.com.ar/beneficios` 301s to `personal.com.ar/pay/beneficios`.** Firecrawl follows it. Keep the short form in the source seed — it's more stable.
- **`waitFor: 6000`** — AEM hydration is slow; anything less returns a partial grid.
- **`beneficiosclub.personalpay.dev`**: if this ever serves a public JSON feed (check periodically), that's the preferred source. Today it's a CRA shell + auth-gated AWS API.
- **Press triangulation blocker list** (for a future Phase 3.3+ pass):
  1. iProUp monthly Personal Pay combo articles publish Nivel 1/2/3 tope tables.
  2. promociones.com.ar has the same figures but is content-farm-adjacent — cross-verify against iProUp.
  3. The canonical "Nivel 3 20% super+combustible tope $8.000" is stable month-over-month; "$3.500 reintegro factura Flow" changes rarely. Cache these as known-good defaults if live triangulation is fragile.
- **Live smoke cost**: ~$0.0034 Gemini / 1 Firecrawl credit / ~10s.

## Live smoke results (2026-04-19)

- First run: 10 inserted, 0 errored, $0.0034 Gemini, 10.1s. All topes null (as designed).
- Idempotency: 0 inserted / 10 updated, $0.0034 (bulk source re-extracts).
- Tope coverage: 0/10 (intentional — this is the PARTIAL coverage flag in action).

## Tests added + fix (Phase 3.3, testing agent)

**Behavioral fix:** tightened the tope-null invariant at the extractor. The
previous extractor normalized `undefined → null` only, trusting the prompt to
keep `tope: null` on every row. A prompt regression or LLM hallucination could
silently upsert invented topes. The extractor now **forces**
`tope = null` + `tope_period = null` regardless of what Gemini returns — the
data contract is "topes are unreachable for this source". Future press
triangulation will come from a different `source_id` and isn't constrained.

Tests:

- `scripts/tests/personalpay-regressions.test.ts` (18 tests): fixture schema
  walk, **tope-null HARD invariant** (even with hallucinated topes in the stub,
  output has `tope === null`), source_id/wallet/issuer_bank pinned, id
  determinism + distinctness (merchant/pct/days tuples) + UUID v5 shape,
  day-phrase corner cases (Lunes a Miércoles → [1,2,3], Lunes/Martes comma →
  [1,2], Fin de semana → [0,6]), same-merchant-different-rate dedup semantics
  (distinct pct survives, same-pct duplicates collapse by id), malformed-row
  rejection, 15k-token envelope, idempotency.
- `scripts/tests/personalpay-source.test.ts` (9 tests): kind/id, default +
  override URL, scrapeOptions (waitFor=6000, markdown-only), full pipeline
  end-to-end asserting upserted rows have `tope=null`, idempotency,
  empty-markdown → errored, **runner-level hallucination guard** (proves the
  defensive extractor fix survives through the runner surface — upserted
  promos are null even if Gemini returned 9999), dry-run semantics.
- Updated `scripts/tests/personalpay-extract.test.ts`: rewrote the old
  "documents the invariant is prompt-only" test to assert the new HARD guard.
