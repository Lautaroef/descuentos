# Sources — The Adapter Playbook

Each ingestion source implements the `Source` interface in `scripts/lib/source.ts`. The generic runner at `scripts/lib/source-runner.ts` handles everything that's shared (Firecrawl scrape, `scrape_runs` SLO logging, upsert-with-TTL, hash-compare skip for `per-url` sources). Per-source logic stays in the adapter.

## Interface

```ts
interface Source {
  id: string;                     // matches sources.id in Postgres
  kind: 'per-url' | 'bulk';
  scrapeOptions?: { formats?, waitFor?, onlyMainContent? };
  listUrls(): Promise<string[]>;
  extract(url, { markdown, rawHtml }): Promise<{
    promos: Promo[];
    ids: string[];                // one per promo, deterministic UUID v5
    overrides?: Array<Record<string, boolean>>;
    cost_usd?: number;
  }>;
}
```

- **`per-url`** — one URL yields exactly one canonical Promo. Example: MODO (hub → detail → one promo per slug). The runner hash-compares the scraped markdown against the row's stored `raw_html_hash`; a match skips the LLM call and just bumps `last_seen_at`.
- **`bulk`** — one URL yields many Promos. Example: Cuenta DNI (press article → N promos). The runner disables hash-compare skip (one cached hash can't prove N promos are all unchanged). Re-extraction is always safe because deterministic UUID v5 ids make upserts idempotent.

## Adding a new source

1. **Create an extractor** in `scripts/lib/<source>-extract.ts`. Own the Gemini prompt, the LLM-output Zod schema, the hand-rolled `responseSchema` for Gemini, and the canonical Zod gate at the end. See `modo-extract.ts` (per-url) or `cuentadni-extract.ts` (bulk) for reference.

2. **Derive deterministic ids.** Each adapter must produce a stable UUID v5 per promo:
   - `per-url`: tuple `(source_url)` is enough — one promo per URL.
   - `bulk`: tuple `(source_url, merchant, pct, ...)` — whatever combination distinguishes promos within one URL. Document the choice inline.

3. **Build the Source adapter** in `scripts/ingestion/<source>-source.ts`. Thin file — `listUrls()` + `extract()` delegate to your extractor.

4. **Wire the CLI**:
   - `scripts/ingestion/<source>-run.ts` wraps `runSource(source, options)`.
   - `scripts/run-<source>.ts` parses flags + invokes the orchestrator.
   - `package.json` `scripts.run-<source>` entry.

5. **Seed the `sources` table** via a migration (or extend `001_init.sql`'s seed block if you're still in early Phase work). Columns: `id`, `display_name`, `tier`, `expected_cadence`, `notes`.

6. **Write tests (same commit)**:
   - Fixture-based extractor test (stub Gemini, run through the canonical Zod gate, assert Promo rows).
   - Runner-level test using the `RunnerTestHooks` seam — stub scrape/upsert/scrape_runs and assert the orchestrator wires them correctly.
   - Schema-rejection test — feed the extractor a deliberately malformed LLM payload, assert the promo is REJECTED rather than silently upserted as garbage.

## Conventions

- **Never import `lib/db.ts` into your extractor.** Extractors are pure transforms from markdown → Promo[]. All DB writes happen in `source-runner.ts`.
- **Keep `scrapeOptions` minimal.** Defaults (`['markdown','rawHtml']`, `waitFor=5000`, `onlyMainContent=true`) cover most sources. Only override when the source genuinely needs something different (press articles don't need rawHtml; wallet SPAs may need a longer `waitFor`).
- **Always validate each promo through the canonical Zod gate before returning it.** The runner trusts your `promos[]` is schema-valid. Rejected promos should be logged, not thrown — one bad row shouldn't nuke the whole article's upserts.
- **Cost instrumentation.** Return `cost_usd` from `extract()` so the runner's rollup surfaces per-run Gemini spend.

## What the runner does for you

- Firecrawl scrape with retry/backoff.
- SHA-256 content-hash + hash-compare skip (per-url only).
- Upsert with `on conflict (id)` + preserve `created_at`.
- `scrape_runs` row: `started_at`, `finished_at`, `promo_count`, `schema_valid`, `error`.
- Concurrent URL processing (`concurrency=3` default; override via CLI `--concurrency=N`).
- `--dry-run` prints URLs without scraping or upserting.
- `--limit=N` caps the URL count (useful for small live smokes).

## What the runner does NOT do

- No retry of your `extract()` beyond what `gemini.ts` already does on transport.
- No dedup across sources — that's Phase 4.
- No per-source concurrency tuning — you inherit `3`. Add a knob only when a real source needs it.
- No hard-delete on stale rows — `softPurgeStalePromos()` just surfaces candidates.

## Current adapters

| Source | `id` | kind | Path |
|---|---|---|---|
| MODO | `modo` | `per-url` | `scripts/ingestion/modo-source.ts` |
| Cuenta DNI | `cuenta-dni` | `bulk` | `scripts/ingestion/cuentadni-source.ts` |

Phase 3.2 (wallets) + 3.3 (supermarkets) will add 5-7 more. Several are MODO-shaped (`per-url`, hub → detail): Brubank, Naranja X, Ualá, Coto, Jumbo, Carrefour. Personal Pay is a mix (web + press). The existing Source shape should cover all of them; if a future adapter genuinely needs more, extend the interface minimally and update the playbook here.
