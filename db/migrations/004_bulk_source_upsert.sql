-- Phase 3.1: accommodate bulk sources (one URL → many Promos).
--
-- Cuenta DNI press-article extraction produces many Promo rows that share the
-- SAME `source_url` (the article URL). The original migration 001 declared
-- `unique (source_id, source_url)` — that collapses all N promos from one
-- article into a single row on upsert.
--
-- Fix: drop the (source_id, source_url) unique constraint and upsert on the
-- primary key `id` instead. The deterministic UUID v5 generator in each adapter
-- (modoPromoId / cuentaDniPromoId) is the real identity key. For MODO, this is
-- equivalent — each slug produces exactly one id AND one source_url. For Cuenta
-- DNI, we get N distinct ids under one source_url, as intended.
--
-- A non-unique index on (source_id, source_url) is retained for the slug-diff
-- / hash-compare lookup in listPromoSlugsForSource.
--
-- Forward-only: existing MODO rows already have deterministic UUID v5 ids and
-- stay addressable by primary key.

alter table promos drop constraint if exists promos_source_url_unique;

create index if not exists promos_source_id_source_url_idx
  on promos (source_id, source_url);
