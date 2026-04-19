// Single source of truth for the Promo shape is `scripts/promo-schema.ts` (Zod).
// The UI imports ONLY types from that file — `import type` is elided at compile time,
// so the NodeNext-vs-Bundler module-mode mismatch never materializes at runtime.
//
// If you need the Zod runtime (validation, `.parse`) in UI code, import it directly
// from `scripts/promo-schema` — Next's bundler will resolve it. Today the UI does not,
// so we keep the surface types-only.
import type { Promo as PromoExtracted } from '../../scripts/promo-schema.js';

// Re-export enum-like string unions so callers have a stable import surface and we
// don't need to reach into `scripts/` from `src/` anywhere else in the codebase.
export type Category = PromoExtracted['category'];
export type Wallet = PromoExtracted['wallet'][number];
export type CardBrand = NonNullable<PromoExtracted['card_brand']>[number];
export type TopePeriod = NonNullable<PromoExtracted['tope_period']>;
export type PromoType = PromoExtracted['promo_type'];
export type PromoVariant = NonNullable<PromoExtracted['variants']>[number];

// UI `Promo` = the extracted row plus the db-augmented columns (`id` from the
// `promos.id` primary key, `updated_at` from the upsert trigger). The ingestion
// emits `PromoExtracted`; the database returns this extended row shape.
export type Promo = PromoExtracted & {
  id: string;
  updated_at?: string;
};
