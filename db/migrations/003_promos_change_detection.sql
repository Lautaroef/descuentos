-- Phase 1: change-detection + audit columns on `promos`.
--
-- `updated_at` — bumped on every upsert alongside `last_seen_at`. Distinguishes
--   "re-seen, content-unchanged" (last_seen_at moves, updated_at stays) from
--   "re-extracted after content change" (both move). Populated by the ingestion
--   adapter; also provides a cheap audit trail for debugging schema drift.
--
-- `raw_html_hash` — SHA-256 of the pre-extract main-content markdown. Used by the
--   hub-crawler's slug-diff logic: if the hash matches the previous run for a slug,
--   we skip the LLM call and just bump `last_seen_at`. Column name mirrors the
--   `scrape_runs.raw_html_hash` naming convention (per architecture.md SLO table)
--   even though we hash markdown, not HTML. Consistent with the SLO table spec —
--   do not rename.

alter table promos add column if not exists updated_at timestamptz not null default now();
alter table promos add column if not exists raw_html_hash text;

-- For the slug-diff "who's gone stale" query in promo-repo.softPurgeStalePromos.
create index if not exists promos_source_last_seen_idx
  on promos (source_id, last_seen_at);
