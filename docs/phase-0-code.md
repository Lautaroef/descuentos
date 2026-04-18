# Phase 0 — Code scaffolding (status)

Status: **scaffolding complete, awaiting `.env.local` from the parallel browser agent** before migrations / smoke-test can run.

## What was scaffolded

- `package.json` — pnpm-managed, Node ≥20, `type: "module"`. Scripts: `migrate`, `smoke-test`, `typecheck`, plus the preserved PoC `validate:*` scripts.
- `tsconfig.json` — strict, `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, path alias `@/* → src/*`, includes `scripts/`, `src/`, `db/`.
- `db/migrations/001_init.sql` — creates `promos` (mirrors the Zod `Promo` shape one-for-one, including `promo_type`, `variants` jsonb, nullable `tope` + `tope_period`), `scrape_runs`, and `sources`. GIN indexes on `wallet`, `issuer_bank`, `valid_days`, `valid_regions`; btree on `tope desc nulls last`, `last_seen_at`, `category`. Seeds 16 sources from `docs/data-sources.md` + `docs/long-tail-sourcing.md` (MODO, wallet catalogs, supermarket cross-wallet catalogs, VTEX six, MP Promociones).
- `scripts/lib/db.ts` — singleton postgres.js client, reads `DATABASE_URL`, exposes `close()`.
- `scripts/migrate.ts` — forward-only migrator with a `_migrations` table, transactional per file, skips already-applied.
- `scripts/smoke-test.ts` — verifies connection, sources seed count, `scrape_runs` reachable, `promos` table exists. Redacts credentials if an error surfaces them.
- `.env.example` — full env var list (Supabase, Firecrawl, Inngest).
- `.gitignore` — covers `.env.local`, `node_modules`, `dist`, pnpm store.
- `README.md` — one-paragraph pointer to `docs/README.md`.
- Dirs: `src/` (placeholder for Phase 2 Next.js), `scripts/ingestion/` (placeholder for Phase 1 scrapers), `scripts/lib/` (shared helpers).

## Deviations from the build plan

- **Stale `package-lock.json` removed.** The PoC used npm; we switched to pnpm per the build plan. Kept `pnpm-lock.yaml` instead.
- **`wallet` column has a CHECK constraint bound to the current enum.** If we later extend the wallet enum (`byma`, `prex`, `bna+`, …), that CHECK must be dropped or re-authored in a follow-up migration. Called out because the enum changed during Phase 2 and we want the signal loud next time.
- **`valid_from` / `valid_to` are `NOT NULL` dates.** The Zod type is non-optional today, so this matches. If a future long-tail source can't produce both ends, relax both to nullable in one migration.
- **Kept the existing PoC `validate:*` scripts and `scripts/samples/`** untouched, per the work contract.

## What the user runs next

After the parallel agent finishes populating `.env.local` (DATABASE_URL + Supabase keys + Firecrawl + Inngest):

```bash
pnpm migrate && pnpm smoke-test
```

Expected output:

```
apply 001_init.sql
✓ Migrations done (1 applied, 0 skipped).

✓ connected
✓ 16 sources seeded
✓ scrape_runs table ready (0 rows)
✓ promos table ready

Smoke test passed.
```

## Known gotchas for Phase 1

1. **`wallet` CHECK constraint** — any new wallet token (Prex, BNA+, etc.) requires an ALTER. Plan migrations accordingly.
2. **`tope_period` nullable** — matches Phase 2 schema fix. Ingestion adapters MUST normalize LLM-emitted empty strings to `null` before upsert (MODO LLM bug per `data-sources.md` gotcha #1 section on "sin tope").
3. **Upsert key is `(source_id, source_url)`** — not a deterministic UUID. If a future source needs UUID v5 (PromoArg pattern per `competitor-promoarg.md`), we add a second migration introducing `canonical_id` and keep the existing unique constraint as a fallback dedup key.
4. **`variants` is stored as jsonb** — the schema lives in the Zod type, not in Postgres. Phase 1 scrapers should validate the whole row with Zod before upserting; the DB will not enforce variant shape.
5. **`promos.valid_days` is `int[]`**, matching `z.array(z.number().int().min(0).max(6))`. The MODO rawHtml regex produces letters → map via `{D:0,L:1,M:2,X:3,J:4,V:5,S:6}` before inserting.
6. **No connection pooling config in `scripts/lib/db.ts` for Supabase pooler** — uses `DATABASE_URL` directly. If we hit pool exhaustion under Inngest concurrency in Phase 1, swap to `DATABASE_POOLER_URL` (already in `.env.example`) and set `prepare: false` (already set, required by pgBouncer transaction-mode pooling).
7. **Migration runner uses `sql.unsafe()`** to apply raw SQL files — intentional, required for DDL. Never expose this surface to user input.

## Cross-references

- Work contract: `docs/build-plan.md` §Phase 0
- Schema contract: `scripts/promo-schema.ts`
- Architecture patterns: `docs/architecture.md`
- Sources (seed rationale): `docs/data-sources.md`, `docs/long-tail-sourcing.md`
