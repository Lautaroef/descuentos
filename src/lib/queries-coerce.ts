// Pure row-coercion helpers split out of `./queries.ts` so node:test can exercise them
// without tripping the `server-only` import guard. postgres-js delivers numeric columns
// as strings and date/timestamp columns as Date objects; the UI `Promo` type wants
// numbers / ISO strings. We also coerce NULL → undefined for every field typed as
// optional on the Zod schema (matches `.optional()` semantics).
//
// This module has zero runtime dependencies — safe to import from anywhere.
import type { Category, Promo, Wallet } from './schema.js';

export interface PromoRowRaw {
  id: string;
  source_id: string;
  source_url: string;
  merchant: string;
  category: Category;
  wallet: Wallet[];
  card_brand: string[] | null;
  issuer_bank: string[] | null;
  pct: string | number;
  promo_type: 'cashback' | 'cuotas' | 'mixed';
  tope: string | number | null;
  tope_period: Promo['tope_period'];
  valid_days: number[] | null;
  valid_regions: string[] | null;
  valid_from: string | Date;
  valid_to: string | Date;
  requires_min_spend: string | number | null;
  stacks_with: string[] | null;
  variants: Promo['variants'] | null;
  last_seen_at: string | Date;
  updated_at?: string | Date;
}

export function toIsoDate(v: string | Date): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

export function coerce(row: PromoRowRaw): Promo {
  return {
    id: row.id,
    source_id: row.source_id,
    source_url: row.source_url,
    merchant: row.merchant,
    category: row.category,
    wallet: row.wallet,
    card_brand: (row.card_brand ?? undefined) as Promo['card_brand'],
    issuer_bank: row.issuer_bank ?? undefined,
    pct: typeof row.pct === 'string' ? Number(row.pct) : row.pct,
    promo_type: row.promo_type,
    tope:
      row.tope === null
        ? null
        : typeof row.tope === 'string'
          ? Number(row.tope)
          : row.tope,
    tope_period: row.tope_period,
    valid_days: row.valid_days ?? [],
    valid_regions: row.valid_regions ?? [],
    valid_from: toIsoDate(row.valid_from),
    valid_to: toIsoDate(row.valid_to),
    requires_min_spend:
      row.requires_min_spend === null
        ? null
        : typeof row.requires_min_spend === 'string'
          ? Number(row.requires_min_spend)
          : row.requires_min_spend,
    stacks_with: row.stacks_with ?? undefined,
    variants: row.variants ?? undefined,
    last_seen_at:
      typeof row.last_seen_at === 'string'
        ? row.last_seen_at
        : row.last_seen_at.toISOString(),
    updated_at: row.updated_at
      ? typeof row.updated_at === 'string'
        ? row.updated_at
        : row.updated_at.toISOString()
      : undefined,
  };
}
