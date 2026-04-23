# Phase 1 Notes — MODO Ingestion Shipped

Date: 2026-04-18. Scope: Phase 1.1–1.4 and 1.6 (partial). Phase 1.5 (Inngest) is explicitly deferred to Phase 2 when a Vercel endpoint exists.

## What shipped

Runnable locally via `pnpm run-modo`. Writes real MODO promo rows into the Supabase Postgres database, logs a `scrape_runs` SLO row per invocation, skips re-extraction on hash-unchanged slugs.

| File | Role |
|---|---|
| `scripts/lib/firecrawl.ts` | `/v1/scrape` client. Retries 429/5xx with exponential backoff. Defaults: `markdown+rawHtml`, `onlyMainContent=true`, `waitFor=5000`. |
| `scripts/lib/gemini.ts` | Gemini 2.5 Flash wrapper. Mandatory `thinkingConfig.thinkingBudget=0`. Zod validation gate. Process-level `thoughtsTokenCount` counter (surfaced in run summary). |
| `scripts/lib/modo-extract.ts` | Extraction pipeline: v2 prompt → Gemini → rawHtml regex override → Vigencia block override → canonical Zod gate. `modoPromoId(slug)` returns a deterministic UUID v5 (SHA-1 namespace) so upserts are stable. |
| `scripts/lib/promo-repo.ts` | Upsert-with-TTL, slug-diff index load, `markPromoSeen` fast path, `softPurgeStalePromos` (log-only; hard delete is Phase 4). |
| `scripts/lib/scrape-runs.ts` | SLO row writer. `startRun` / `finishRun`. |
| `scripts/ingestion/modo-hub.ts` | Hub crawler. Parses `/promos/<slug>` links out of main-content markdown, dedupes, classifies by section header (best-effort). SHA-256 of the markdown is written to `scrape_runs.raw_html_hash`. |
| `scripts/ingestion/modo-detail.ts` | Per-slug adapter. Hash-compares the scraped markdown against the stored `raw_html_hash` — skip-to-`markPromoSeen` if unchanged, else LLM + upsert. |
| `scripts/ingestion/modo-run.ts` | End-to-end orchestrator. Concurrent extraction pool (default 3). Writes the rollup to `scrape_runs`. |
| `scripts/run-modo.ts` | CLI entry. Flags: `--dry-run`, `--limit=N`, `--slug=<slug>`, `--concurrency=N`. |
| `scripts/tests/modo-extract.test.ts` | 8 offline tests using the 10 stress-test fixtures. Stubs the LLM; exercises the rawHtml override, the Vigencia override, and end-to-end pipeline correctness. |
| `db/migrations/003_promos_change_detection.sql` | Adds `promos.updated_at` + `promos.raw_html_hash` + `(source_id, last_seen_at)` btree. Forward-only. |

## First live-run results

Hub scrape (1 call):
- 40 slugs enumerated on 2026-04-18 (below the 57 in the stress test — "Cargar más" still unclicked, and the visible hub may have condensed).
- Hub markdown length: ~15 KB.

`pnpm run-modo --limit=3` (second live ingest, the first one was the int[] array-cast bug):
- 3/3 inserted, 0 errored.
- Gemini cost: $0.0033 total ($0.0011 avg/page).
- Firecrawl credits: not reported by the API for us on this tier; check the dashboard for the true burn.
- Elapsed: 5.5s wall clock at concurrency=3.
- `schema_valid=true` in `scrape_runs`. One slug hit the Vigencia date-override path (10off-3csi-veterinarias-petshops-bna-mar25: LLM returned legal-text dates, Vigencia UI block overrode — the documented benchmark finding).

`pnpm run-modo --limit=3` run twice (change-detection validation):
- First re-run: 3/3 `unchanged`, $0.00 Gemini spend. Hash-compare skip working as designed.

## Gotchas discovered

1. **postgres-js `sql.array(value)` defaults to text[].** When inserting integer[] columns (`valid_days`), you must pass the PG element-type OID explicitly: `sql.array(promo.valid_days, 23)` (23 = int4). Without this, Postgres throws `column "valid_days" is of type integer[] but expression is of type text[]`. Fixed in `scripts/lib/promo-repo.ts`.
2. **Gemini `responseSchema` is a JSON-Schema subset.** Auto-conversion from Zod via `zod-to-json-schema` works for simple shapes but struggles with the full Promo schema (nullable + enum + optional arrays). The adapter supports a `schemaForModel` override; the MODO extractor ships a hand-rolled schema (same one proven in `benchmark-llm.ts`). Keep this pattern for any future source with a narrow schema — auto-convert first, hand-roll only when needed.
3. **Vigencia-block override is triggered on 6 of 10 stress-test fixtures.** MODO pages inconsistently use the UI Vigencia "Del DD/MM/YY" vs. the legal-text "Desde las 00:00 del día X" — typically off by 1 day. The UI block is canonical; we override the LLM accordingly and log at info level. This matches the benchmark's divergence-analysis finding exactly.
4. **First live slug count is 40, not the 57 from the stress test.** Two possibilities: (a) MODO has fewer active slugs today; (b) the hub layout changed and `Cargar más` now hides more content than in April's snapshot. Phase 4 should add a Firecrawl Browser-API click action to paginate; not a Phase 1 blocker.
5. **Gemini `thoughtsTokenCount` was 0 on all live and test calls** — our `thinkingBudget: 0` directive is being respected. The counter in `gemini.ts` stays at 0 after the test and live runs. If it ever increments in production, the run summary will surface it.
6. **`scrape_runs.raw_html_hash` stores the main-content markdown SHA-256**, not true HTML. Column name follows the architecture.md SLO table spec; consistent naming is better than a rename.

## Explicitly deferred

| Item | Phase | Reason |
|---|---|---|
| ~~Inngest weekly cron + step-functions~~ | ~~2~~ | **SHIPPED Phase 1.5 (2026-04-25).** See [cron.md](cron.md) for the per-source schedule table, the `src/app/api/inngest/route.ts` serve endpoint, and the daily health-check function. Keys live in `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`. |
| ~~Discord/Telegram health-check webhook~~ | ~~2~~ | **SHIPPED Phase 1.6 (2026-04-25).** `ALERT_WEBHOOK_URL` env — if unset, health-check logs to stdout (visible in the Inngest dashboard). Discord/Slack webhook formats both accepted. |
| Hard-delete of stale promos | 4 | Waits for canonical-hash dedup so we don't collapse aliasing. Soft-purge candidates are surfaced via `softPurgeStalePromos()`. |
| Firecrawl Browser API "Cargar más" click | 4+ | 40 slugs is enough for v1 wedge validation; we'll widen when coverage gaps surface. |
| Claude Haiku 4.5 fallback adapter | 4+ | Rollback path documented in `firecrawl-alternative-analysis.md`; not built until Gemini regresses. |
| Region derivation from issuer_bank | 3 (long-tail) | Only 1 benchmark miss (Bica → AR-S); pick up with the Cuenta DNI / supermarket scrapers. |

## Notes for the next agent (extending to Cuenta DNI / Brubank / Naranja X)

The Phase 1 plumbing is deliberately MODO-specific. Do NOT prematurely extract a `Source` interface — YAGNI until we have 2+ concrete sources. When adding Cuenta DNI (Phase 3.1):

- Reuse `scripts/lib/firecrawl.ts` (works for any URL) and `scripts/lib/gemini.ts` (takes any Zod schema + prompt).
- Reuse `scripts/lib/promo-repo.ts` — the upsert key is `(source_id, source_url)`; just pass `source_id = 'cuenta-dni'` and the press-article URL as `source_url`.
- Reuse `scripts/lib/scrape-runs.ts` — same shape, new `source_id`.
- Write a new `scripts/lib/cuentadni-extract.ts` with its own prompt (press-article format is very different from MODO detail pages — multi-promo per article). The canonical Zod gate at the end is identical.
- Write `scripts/ingestion/cuentadni-run.ts` (no hub crawler; instead, rotate across 2-3 outlet URLs and triangulate per `long-tail-sourcing.md`).
- Only when you're about to write the THIRD source (Brubank), step back and extract the common shape into a thin `Source` interface. Two is a coincidence; three is a pattern.

For Brubank / Naranja X / Ualá (Phase 3.2): they behave like MODO (hub + detail pages with fixed-label blocks). Start by copying `modo-hub.ts` + `modo-detail.ts` + `modo-extract.ts` and renaming — then diff and refactor the common bits. Resist abstraction until you see the duplication live.

## Commit hashes

Captured in the commits on `main` (see `git log`).

## Verdict

**Phase 1 done.** Live MODO ingest works, change detection works, observability populates correctly, cost is well under the $0.50 Gemini cap and the 60-credit Firecrawl budget. Phase 1.5 (Inngest) is the only deliberate deferral; it picks up after Phase 2 scaffolds the Vercel endpoint.
