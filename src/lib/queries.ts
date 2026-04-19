// Server-only Postgres queries for the UI. Pure filter parsing lives in `./filters.ts`,
// row coercion lives in `./queries-coerce.ts`, so tests can exercise those pieces
// without tripping the `server-only` import guard. This module is just the SQL shell.
import 'server-only';
import { cache } from 'react';
import { getDb } from './db';
import { FRESHNESS_DAYS } from './constants';
import type { PromoFilter } from './filters';
import type { Promo } from './schema';
import { coerce, type PromoRowRaw } from './queries-coerce';

export type { PromoFilter } from './filters';
export { parseFilterFromParams, parseDayParam, parseRegionParam, filterToSearchParams } from './filters';

// =============================================================================
// Queries
// =============================================================================

/**
 * List promos. Sort `tope` DESC NULLS LAST with `pct` tiebreak. Always applies the TTL gate.
 *
 * Region matching semantics: a promo matches when `valid_regions` is empty (= national)
 * OR contains the requested region. This is the correctness bit PromoArg gets wrong —
 * they treat regional promos as "no region filter applied".
 */
export async function listPromos(filter: PromoFilter): Promise<Promo[]> {
  const sql = getDb();

  const walletArr = filter.wallets.length ? filter.wallets : null;
  const categoryArr = filter.categories.length ? filter.categories : null;
  const bankArr = filter.banks.length ? filter.banks : null;
  const day = filter.day;
  const region = filter.region && filter.region !== 'AR' ? filter.region : null;

  const rows = await sql<PromoRowRaw[]>`
    select
      id, source_id, source_url, merchant, category, wallet, card_brand, issuer_bank,
      pct, promo_type, tope, tope_period,
      valid_days, valid_regions, valid_from, valid_to,
      requires_min_spend, stacks_with, variants,
      last_seen_at, updated_at
    from promos
    where last_seen_at > now() - (${FRESHNESS_DAYS} || ' days')::interval
      and (${walletArr}::text[] is null or wallet && ${walletArr}::text[])
      and (${categoryArr}::text[] is null or category = any(${categoryArr}::text[]))
      and (${bankArr}::text[] is null or issuer_bank && ${bankArr}::text[])
      and (${day}::int is null or ${day}::int = any(valid_days) or array_length(valid_days, 1) is null)
      and (
        ${region}::text is null
        or coalesce(array_length(valid_regions, 1), 0) = 0
        or ${region}::text = any(valid_regions)
      )
    order by tope desc nulls last, pct desc, merchant asc
  `;

  return rows.map(coerce);
}

/**
 * Fetch a single promo by UUID. Returns `null` if missing. Does NOT apply the TTL gate —
 * detail pages still resolve for stale IDs (users landing from SEO or old links see the
 * last-known content instead of a bare 404).
 */
export const getPromoById = cache(async (id: string): Promise<Promo | null> => {
  const sql = getDb();
  const rows = await sql<PromoRowRaw[]>`
    select
      id, source_id, source_url, merchant, category, wallet, card_brand, issuer_bank,
      pct, promo_type, tope, tope_period,
      valid_days, valid_regions, valid_from, valid_to,
      requires_min_spend, stacks_with, variants,
      last_seen_at, updated_at
    from promos
    where id = ${id}
    limit 1
  `;
  if (rows.length === 0) return null;
  return coerce(rows[0]);
});

/** All fresh promo IDs + last_seen_at, used by the sitemap. */
export async function listPromoSitemap(): Promise<Array<{ id: string; last_seen_at: string }>> {
  const sql = getDb();
  const rows = await sql<{ id: string; last_seen_at: string | Date }[]>`
    select id, last_seen_at
    from promos
    where last_seen_at > now() - (${FRESHNESS_DAYS} || ' days')::interval
    order by last_seen_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    last_seen_at:
      typeof r.last_seen_at === 'string' ? r.last_seen_at : r.last_seen_at.toISOString(),
  }));
}

/** Top-level aggregates for the home page banner. */
export const getPromoStats = cache(
  async (): Promise<{ total: number; withTope: number; lastSeen: string | null }> => {
    const sql = getDb();
    const rows = await sql<{ total: number; with_tope: number; last_seen: string | Date | null }[]>`
    select
      count(*)::int as total,
      count(*) filter (where tope is not null)::int as with_tope,
      max(last_seen_at) as last_seen
    from promos
    where last_seen_at > now() - (${FRESHNESS_DAYS} || ' days')::interval
  `;
    const r = rows[0];
    return {
      total: r.total,
      withTope: r.with_tope,
      lastSeen: r.last_seen
        ? typeof r.last_seen === 'string'
          ? r.last_seen
          : r.last_seen.toISOString()
        : null,
    };
  },
);
