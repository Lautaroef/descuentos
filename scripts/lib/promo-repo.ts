// Postgres ops for promos. Upsert-with-TTL pattern per docs/architecture.md §1.
//
// Identity key = deterministic UUID v5 `id` (primary key). Each adapter derives its own
// ids:
//   - MODO (per-url):   modoPromoId(slug)              — one id per URL
//   - Cuenta DNI (bulk): cuentaDniPromoId(url, merchant, pct) — many ids per URL
//
// Migration 004 dropped the old `(source_id, source_url)` unique constraint so bulk
// sources can write N promos under one source_url. `listPromoSlugsForSource` still reads
// the first matching row per URL for hash-compare; bulk sources don't use that path.
//
// `last_seen_at` is the TTL signal; serving layer filters to last N days. Hard-delete of
// stale rows is deferred to Phase 4 (dedup); here we just surface candidates.
import type { Promo } from '../promo-schema.js';
import { getDb } from './db.js';

export interface PersistedPromoMeta {
  id: string;
  source_id: string;
  source_url: string;
  raw_html_hash: string | null;
  last_seen_at: Date;
}

/**
 * Upsert a single promo. Conflict key is the primary key `id` (deterministic UUID v5).
 * - On INSERT: returns 'inserted'.
 * - On UPDATE: returns 'updated' (all scraped fields refreshed, created_at preserved).
 *
 * `rawHtmlHash` is stored alongside the row for fast change detection on the next run.
 */
export async function upsertPromo(args: {
  id: string;
  promo: Promo;
  rawHtmlHash: string;
}): Promise<'inserted' | 'updated'> {
  const sql = getDb();
  const { id, promo, rawHtmlHash } = args;

  const rows = await sql<{ action: string }[]>`
    insert into promos (
      id, source_id, source_url,
      merchant, category, wallet, card_brand, issuer_bank,
      pct, promo_type, tope, tope_period,
      valid_days, valid_regions, valid_from, valid_to,
      requires_min_spend, stacks_with, variants,
      raw_html_hash,
      last_seen_at, updated_at
    ) values (
      ${id}, ${promo.source_id}, ${promo.source_url},
      ${promo.merchant}, ${promo.category},
      ${sql.array(promo.wallet)},
      ${promo.card_brand ? sql.array(promo.card_brand) : null},
      ${promo.issuer_bank ? sql.array(promo.issuer_bank) : null},
      ${promo.pct}, ${promo.promo_type}, ${promo.tope}, ${promo.tope_period},
      ${sql.array(promo.valid_days, 23)}, ${sql.array(promo.valid_regions)},
      ${promo.valid_from}, ${promo.valid_to},
      ${promo.requires_min_spend},
      ${promo.stacks_with ? sql.array(promo.stacks_with) : null},
      ${promo.variants ? sql.json(promo.variants) : null},
      ${rawHtmlHash},
      now(), now()
    )
    on conflict (id) do update set
      source_id          = excluded.source_id,
      source_url         = excluded.source_url,
      merchant           = excluded.merchant,
      category           = excluded.category,
      wallet             = excluded.wallet,
      card_brand         = excluded.card_brand,
      issuer_bank        = excluded.issuer_bank,
      pct                = excluded.pct,
      promo_type         = excluded.promo_type,
      tope               = excluded.tope,
      tope_period        = excluded.tope_period,
      valid_days         = excluded.valid_days,
      valid_regions      = excluded.valid_regions,
      valid_from         = excluded.valid_from,
      valid_to           = excluded.valid_to,
      requires_min_spend = excluded.requires_min_spend,
      stacks_with        = excluded.stacks_with,
      variants           = excluded.variants,
      raw_html_hash      = excluded.raw_html_hash,
      last_seen_at       = now(),
      updated_at         = now()
    returning (xmax = 0) as inserted
  `;

  // postgres-js returns boolean "inserted" via the xmax=0 trick.
  const insertedRaw = (rows[0] as any)?.inserted;
  return insertedRaw === true || insertedRaw === 't' ? 'inserted' : 'updated';
}

/**
 * List identifying metadata for every promo currently stored under `source_id`.
 * Used by the hub crawler to run slug-diff and hash-based change detection.
 */
export async function listPromoSlugsForSource(source_id: string): Promise<PersistedPromoMeta[]> {
  const sql = getDb();
  const rows = await sql<PersistedPromoMeta[]>`
    select id, source_id, source_url, raw_html_hash, last_seen_at
    from promos
    where source_id = ${source_id}
  `;
  return rows;
}

/**
 * Fast `last_seen_at` bump for an unchanged promo. Avoids rewriting every column when the
 * markdown hash hasn't moved.
 */
export async function markPromoSeen(source_id: string, source_url: string): Promise<void> {
  const sql = getDb();
  await sql`
    update promos
    set last_seen_at = now()
    where source_id = ${source_id} and source_url = ${source_url}
  `;
}

/**
 * Surface promos whose `last_seen_at` is older than `horizon_days`. Does NOT delete —
 * hard-delete gate arrives in Phase 4. Returns candidates for the caller to log / alert on.
 */
export async function softPurgeStalePromos(
  source_id: string,
  horizon_days = 3,
): Promise<PersistedPromoMeta[]> {
  const sql = getDb();
  const rows = await sql<PersistedPromoMeta[]>`
    select id, source_id, source_url, raw_html_hash, last_seen_at
    from promos
    where source_id = ${source_id}
      and last_seen_at < now() - (${horizon_days} || ' days')::interval
  `;
  return rows;
}
