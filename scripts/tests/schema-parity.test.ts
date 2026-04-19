// Drift guard: the UI `Promo` must stay in sync with the canonical Zod schema.
//
// Today `src/lib/schema.ts` derives its types from `scripts/promo-schema.ts` via
// `import type`, so parity is enforced structurally by the compiler. This runtime
// test is still worth keeping: if a future agent forks the UI schema back into
// an independent file, the key/enum assertions here will fail and call it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { Promo as PromoSchema } from '../promo-schema.js';

// Re-import the UI-side types from the barrel. `import type` is erased at runtime,
// so this just anchors the test to the file — if someone deletes it the test won't
// compile either.
import type { Promo as UiPromo } from '../../src/lib/schema.js';

const EXPECTED_SHAPE_KEYS = [
  'source_id',
  'source_url',
  'merchant',
  'category',
  'wallet',
  'card_brand',
  'issuer_bank',
  'pct',
  'promo_type',
  'tope',
  'tope_period',
  'valid_days',
  'valid_regions',
  'valid_from',
  'valid_to',
  'requires_min_spend',
  'stacks_with',
  'variants',
  'last_seen_at',
] as const;

const EXPECTED_CATEGORY_VALUES = [
  'supermercado',
  'farmacia',
  'gastronomia',
  'combustible',
  'transporte',
  'indumentaria',
  'electro',
  'otro',
] as const;

const EXPECTED_WALLET_VALUES = [
  'modo',
  'mercadopago',
  'cuentadni',
  'uala',
  'naranjax',
  'personalpay',
  'brubank',
  'bna_plus',
  'prex',
  'yoy',
  'buepp',
  'lemon',
  'astropay',
  'reba',
  // Supermarket-native membership programs (Phase 3.3, migration 005).
  'comunidad_coto',
  'jumbo_mas',
  'mi_carrefour',
] as const;

const EXPECTED_PROMO_TYPE_VALUES = ['cashback', 'cuotas', 'mixed'] as const;
const EXPECTED_TOPE_PERIOD_VALUES = ['ticket', 'day', 'week', 'month'] as const;
const EXPECTED_CARD_BRAND_VALUES = ['visa', 'mastercard', 'amex', 'cabal', 'naranja'] as const;

test('Promo Zod schema exposes the expected field keys', () => {
  const keys = Object.keys(PromoSchema.shape).sort();
  assert.deepEqual(keys, [...EXPECTED_SHAPE_KEYS].sort());
});

test('UI Promo structurally extends the canonical Promo with id + updated_at', () => {
  // Type-level assertion: the exported UI `Promo` must be assignable to
  // `z.infer<typeof PromoSchema> & { id: string; updated_at?: string }`.
  // If someone forks the UI schema and drops a field, this block stops compiling.
  type _Expected = z.infer<typeof PromoSchema> & { id: string; updated_at?: string };
  const _typeCheck = (x: UiPromo): _Expected => x;
  void _typeCheck;
  assert.ok(true);
});

test('category enum values are canonical', () => {
  const field = PromoSchema.shape.category as z.ZodEnum<[string, ...string[]]>;
  assert.deepEqual([...field.options].sort(), [...EXPECTED_CATEGORY_VALUES].sort());
});

test('wallet enum values are canonical', () => {
  // `wallet` is z.array(z.enum([...])) — unwrap one level to get the enum.
  const arr = PromoSchema.shape.wallet as z.ZodArray<z.ZodEnum<[string, ...string[]]>>;
  const inner = arr.element;
  assert.deepEqual([...inner.options].sort(), [...EXPECTED_WALLET_VALUES].sort());
});

test('card_brand enum values are canonical', () => {
  // `card_brand` is optional array of enum.
  const optional = PromoSchema.shape.card_brand as z.ZodOptional<
    z.ZodArray<z.ZodEnum<[string, ...string[]]>>
  >;
  const inner = optional.unwrap().element;
  assert.deepEqual([...inner.options].sort(), [...EXPECTED_CARD_BRAND_VALUES].sort());
});

test('promo_type enum values are canonical', () => {
  // `.default(...)` wraps the enum in ZodDefault.
  const withDefault = PromoSchema.shape.promo_type as z.ZodDefault<z.ZodEnum<[string, ...string[]]>>;
  const inner = withDefault.removeDefault();
  assert.deepEqual([...inner.options].sort(), [...EXPECTED_PROMO_TYPE_VALUES].sort());
});

test('tope_period enum values are canonical', () => {
  // `.nullable()` wraps in ZodNullable.
  const nullable = PromoSchema.shape.tope_period as z.ZodNullable<z.ZodEnum<[string, ...string[]]>>;
  const inner = nullable.unwrap();
  assert.deepEqual([...inner.options].sort(), [...EXPECTED_TOPE_PERIOD_VALUES].sort());
});
