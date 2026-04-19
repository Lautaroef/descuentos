// Shape types consumed by the UI. Mirrors scripts/promo-schema.ts one-to-one.
//
// We keep these as pure TypeScript types (no Zod runtime) because the UI reads data that's
// already been validated at ingest time. If either side changes, both have to move together —
// there's only one canonical promo shape and these two files are the authoritative record.
// Cross-compile between NodeNext (scripts) and Bundler (Next) would otherwise fight us.

export type Category =
  | 'supermercado'
  | 'farmacia'
  | 'gastronomia'
  | 'combustible'
  | 'transporte'
  | 'indumentaria'
  | 'electro'
  | 'otro';

export type Wallet =
  | 'modo'
  | 'mercadopago'
  | 'cuentadni'
  | 'uala'
  | 'naranjax'
  | 'personalpay'
  | 'brubank'
  | 'bna_plus'
  | 'prex'
  | 'yoy'
  | 'buepp'
  | 'lemon'
  | 'astropay'
  | 'reba';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'cabal' | 'naranja';
export type TopePeriod = 'ticket' | 'day' | 'week' | 'month';
export type PromoType = 'cashback' | 'cuotas' | 'mixed';

export interface PromoVariant {
  pct: number;
  tope?: number | null;
  tope_period?: TopePeriod | null;
  category_scope?: string;
  notes?: string;
}

export interface Promo {
  id: string;
  source_id: string;
  source_url: string;
  merchant: string;
  category: Category;
  wallet: Wallet[];
  card_brand?: CardBrand[] | null;
  issuer_bank?: string[] | null;
  pct: number;
  promo_type: PromoType;
  tope: number | null;
  tope_period: TopePeriod | null;
  valid_days: number[]; // 0 = Sunday, 6 = Saturday
  valid_regions: string[];
  valid_from: string; // YYYY-MM-DD
  valid_to: string; // YYYY-MM-DD
  requires_min_spend: number | null;
  stacks_with?: string[] | null;
  variants?: PromoVariant[] | null;
  last_seen_at: string; // ISO timestamp
  updated_at?: string;
}
