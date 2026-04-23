-- Phase 3.4 (2026-04-23): supermarket canonical id v2 — delete old rows.
--
-- WHY
-- ---
-- The v1 id tuple (source_url, day_key, primary_bank, pct, promo_type) collapsed
-- distinct promos in two documented ways:
--
--   1. Cuotas tiers from the same bank on the same days. Jumbo's Cencopay shows
--      3/6/12/18/24 cuotas as separate blocks on `Todos los días`; under v1 all
--      five collapse to a single row (first wins). Symptom observed in
--      production on the first live Jumbo run (2026-04-23): the runner reported
--      "30 inserted / 47 updated" but the DB only held 14 rows for
--      source_id='jumbo-descuentos'.
--
--   2. Multi-bank promos on Carrefour where only the FIRST sorted bank entered
--      the id. Two distinct blocks with bank compositions [bbva, galicia] and
--      [bbva, santander] on the same day would share bank_key='bbva' and
--      collide.
--
-- The new v2 tuple:
--   (source_url, day_key, banks_key, wallets_key, pct, promo_type, variant_key)
-- Where:
--   - banks_key   = ALL sorted+deduped banks joined by `|`  (or `_none_`)
--   - wallets_key = ALL sorted+deduped wallets joined by `|` (or `_none_`)
--   - variant_key = cNN for cuotas rows (from cuotas_count); tope:period for
--                   cashback/mixed rows; empty when no tope
-- Under a new UUID namespace (SUPERMARKET_UUID_NAMESPACE_V2) so v1 and v2 ids
-- never collide.
--
-- See scripts/lib/supermarket-extract.ts for the full rationale.
--
-- APPROACH
-- --------
-- The supermarket sources (coto-descuentos, jumbo-descuentos,
-- carrefour-descuentos-bancarios) are all `kind: 'bulk'`, re-scraped on every
-- run. Their rows carry no derived product logic elsewhere (no FK references,
-- no long-lived analytical queries). The cheapest + cleanest path is:
--
--   DELETE the old v1 rows, then let the next `pnpm run-<chain>` re-ingest
--   them under v2 ids.
--
-- This avoids:
--   - Writing a per-row UPDATE mapping v1 id → v2 id (requires running the
--     extractor in "re-id only" mode — more code, more risk)
--   - Leaving orphan v1 rows with last_seen_at in the past that gradually
--     age out of the serving-layer visibility gate
--
-- FORWARD-ONLY
-- ------------
-- Data regenerates on the next scrape. If the chains' catalogs haven't changed
-- meaningfully, the re-ingested rows will have the same *content* as the
-- deleted ones, just with new ids (unavoidable — the whole point of this
-- migration is that v1 ids were wrong).
--
-- The re-ingestion also clears the 2026-04-23 Jumbo collapse evidence: 14
-- rows had been masking ~30-40 distinct promos. Post-migration, the next
-- Jumbo run should show inserted ≥ 20 and the unique row count matching the
-- inserted+updated tally.

delete from promos where source_id in (
  'coto-descuentos',
  'jumbo-descuentos',
  'carrefour-descuentos-bancarios'
);

-- Clear any scrape_runs error rows too — they reference the old ids
-- implicitly via their promo_count. Not strictly required for correctness but
-- keeps the SLO table clean for the relaunch.
--
-- We DON'T delete scrape_runs rows wholesale since they're historical SLO
-- data. Just noting the impact: `promo_count` on pre-2026-04-23 rows
-- represents v1 counts and should be interpreted as "best-effort pre-fix".

-- No schema changes. The id column (PK) is already UUID; v2 ids fit the same
-- column. The only code-level change is the canonical id computation in
-- scripts/lib/supermarket-extract.ts.
