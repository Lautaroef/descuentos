// Unit tests for the SHARED supermarket-extract helper used by Coto, Jumbo,
// and Carrefour. These tests target the pure functions (normalizers, id
// builders) and the critical idempotency-hardening behaviour added in Phase
// 3.3 to defuse Gemini token-boundary nondeterminism.
//
// Scope: no fixtures, no Gemini, no I/O. Pure TS.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPERMARKET_UUID_NAMESPACE,
  SUPERMARKET_UUID_NAMESPACE_V2,
  dayKey,
  primaryBank,
  banksKey,
  walletsKey,
  variantKey,
  canonicalPct,
  canonicalPromoType,
  normalizeWallets,
  normalizeBanks,
  normalizeCardBrands,
  supermarketPromoId,
  supermarketPromoIdV1,
} from '../lib/supermarket-extract.js';

// =============================================================================
// UUID namespace constant — must stay stable across imports. Regenerating it
// would orphan every existing row in the DB.
// =============================================================================

test('supermarket: UUID namespace constant is stable and well-formed', () => {
  assert.strictEqual(typeof SUPERMARKET_UUID_NAMESPACE, 'string');
  assert.match(
    SUPERMARKET_UUID_NAMESPACE,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  // Pin the exact value — changing this orphans production rows.
  assert.strictEqual(
    SUPERMARKET_UUID_NAMESPACE,
    '7b9f3d1c-2e4a-5b6c-8d7e-9f0a1b2c3d4e',
  );
});

// =============================================================================
// dayKey — sort + dedup contract
// =============================================================================

test('supermarket: dayKey sorts and dedupes', () => {
  assert.strictEqual(dayKey([1]), '1');
  assert.strictEqual(dayKey([6, 0]), '0,6');
  assert.strictEqual(dayKey([0, 1, 2, 3, 4, 5, 6]), '0,1,2,3,4,5,6');
  // Duplicate input → single entry in the key (regression for Gemini drift).
  assert.strictEqual(dayKey([6, 0, 6]), '0,6');
  assert.strictEqual(dayKey([3, 3, 3]), '3');
  // Order-independence.
  assert.strictEqual(dayKey([6, 0, 4, 5]), dayKey([0, 4, 5, 6]));
});

test('supermarket: dayKey drops out-of-range / non-integer values', () => {
  // 7 is out of ISO weekday range; keep the valid ones.
  assert.strictEqual(dayKey([1, 7, 3]), '1,3');
  assert.strictEqual(dayKey([-1, 2]), '2');
  // Floats are NaN after Number.isInteger check → dropped.
  assert.strictEqual(dayKey([1.5 as any, 3]), '3');
  assert.strictEqual(dayKey([]), '');
});

// =============================================================================
// primaryBank — first sorted bank, dedup + lowercase
// =============================================================================

test('supermarket: primaryBank returns "_none_" for empty input', () => {
  assert.strictEqual(primaryBank([]), '_none_');
  assert.strictEqual(primaryBank([' ', '']), '_none_');
});

test('supermarket: primaryBank returns alphabetically-first lowercased bank', () => {
  assert.strictEqual(primaryBank(['galicia']), 'galicia');
  assert.strictEqual(primaryBank(['macro', 'bbva']), 'bbva');
  assert.strictEqual(primaryBank(['Macro', 'BBVA']), 'bbva'); // case-insensitive
  // Dedup: same input, different ordering → same answer.
  assert.strictEqual(
    primaryBank(['bbva', 'galicia', 'bbva']),
    primaryBank(['galicia', 'bbva']),
  );
});

// =============================================================================
// canonicalPct — integer rounding
// =============================================================================

test('supermarket: canonicalPct rounds to nearest integer', () => {
  assert.strictEqual(canonicalPct(10), 10);
  assert.strictEqual(canonicalPct(10.0), 10);
  assert.strictEqual(canonicalPct(10.4), 10);
  assert.strictEqual(canonicalPct(10.5), 11);
  assert.strictEqual(canonicalPct(29.999999), 30);
  assert.strictEqual(canonicalPct(0), 0);
  assert.strictEqual(canonicalPct(100), 100);
});

test('supermarket: canonicalPct handles non-finite input defensively', () => {
  assert.strictEqual(canonicalPct(NaN), 0);
  assert.strictEqual(canonicalPct(Infinity), 0);
  assert.strictEqual(canonicalPct(-Infinity), 0);
});

// =============================================================================
// canonicalPromoType — trim + lowercase
// =============================================================================

test('supermarket: canonicalPromoType trims and lowercases', () => {
  assert.strictEqual(canonicalPromoType('cashback'), 'cashback');
  assert.strictEqual(canonicalPromoType('CASHBACK'), 'cashback');
  assert.strictEqual(canonicalPromoType(' cuotas '), 'cuotas');
  assert.strictEqual(canonicalPromoType('Mixed'), 'mixed');
});

// =============================================================================
// supermarketPromoId — v2 id scheme (2026-04-23).
//   The tuple now includes banks_key (ALL sorted banks joined by `|`),
//   wallets_key (ALL sorted wallets joined by `|`), and variant_key (for
//   cuotas rows the cuotas_count, for cashback the compact tope signature).
//   See scripts/lib/supermarket-extract.ts for the rationale.
// =============================================================================

test('supermarket: SUPERMARKET_UUID_NAMESPACE_V2 is stable and well-formed', () => {
  assert.strictEqual(typeof SUPERMARKET_UUID_NAMESPACE_V2, 'string');
  assert.match(
    SUPERMARKET_UUID_NAMESPACE_V2,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  // Pin the exact value — changing this orphans production rows under v2.
  assert.strictEqual(
    SUPERMARKET_UUID_NAMESPACE_V2,
    '2a6d7e1f-9c8b-4a3e-8d5c-1f0e2b3a4c5d',
  );
  // v1 and v2 must be different.
  assert.notStrictEqual(SUPERMARKET_UUID_NAMESPACE_V2, SUPERMARKET_UUID_NAMESPACE);
});

const baseV2 = () => ({
  source_url: 'https://example.com/a',
  day_key: '1,3',
  banks_key: 'galicia',
  wallets_key: '_none_',
  pct: 20,
  promo_type: 'cashback',
  variant_key: '',
});

test('supermarket: supermarketPromoId is deterministic across identical tuples', () => {
  const t = baseV2();
  const a = supermarketPromoId(t);
  const b = supermarketPromoId({ ...t });
  assert.strictEqual(a, b);
  // UUID v5 shape.
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('supermarket: supermarketPromoId differs per tuple component', () => {
  const base = baseV2();
  const baseId = supermarketPromoId(base);
  assert.notStrictEqual(
    baseId,
    supermarketPromoId({ ...base, source_url: 'https://example.com/b' }),
  );
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, day_key: '2' }));
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, banks_key: 'macro' }));
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, wallets_key: 'modo' }));
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, pct: 30 }));
  assert.notStrictEqual(
    baseId,
    supermarketPromoId({ ...base, promo_type: 'cuotas' }),
  );
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, variant_key: 'c12' }));
});

test('supermarket: supermarketPromoId is stable under Gemini-style pct drift', () => {
  // Core idempotency regression: Gemini sometimes emits `10` on one run and
  // `10.0`/`9.9999` on the next. The normalized id MUST stay byte-identical.
  const base = { ...baseV2(), banks_key: 'carrefour', pct: 10, day_key: '6' };
  const id = supermarketPromoId(base);
  assert.strictEqual(supermarketPromoId({ ...base, pct: 10.0 }), id);
  assert.strictEqual(supermarketPromoId({ ...base, pct: 9.999999 }), id);
  assert.strictEqual(supermarketPromoId({ ...base, pct: 10.49 }), id);
});

test('supermarket: supermarketPromoId is stable under banks_key casing drift', () => {
  const base = { ...baseV2(), banks_key: 'bbva', pct: 10, day_key: '6' };
  const id = supermarketPromoId(base);
  assert.strictEqual(supermarketPromoId({ ...base, banks_key: 'BBVA' }), id);
  assert.strictEqual(supermarketPromoId({ ...base, banks_key: ' bbva ' }), id);
});

test('supermarket: supermarketPromoId is stable under promo_type casing drift', () => {
  const base = baseV2();
  const id = supermarketPromoId(base);
  assert.strictEqual(supermarketPromoId({ ...base, promo_type: 'CASHBACK' }), id);
  assert.strictEqual(supermarketPromoId({ ...base, promo_type: ' cashback ' }), id);
});

// =============================================================================
// v1 tuple — retained for regression tests that prove the pre-fix collision
// shape. `supermarketPromoIdV1` MUST produce a collision for two distinct
// cuotas tiers on the same bank + day; this test pins that behavior so future
// agents know the v1 scheme is insufficient.
// =============================================================================

test('supermarket: v1 id collapses distinct cuotas tiers (regression pin)', () => {
  const shared = {
    source_url: 'https://www.jumbo.com.ar/descuentos-del-dia',
    day_key: '0,1,2,3,4,5,6',
    bank_key: 'cencopay',
    pct: 0,
    promo_type: 'cuotas',
  };
  const id3 = supermarketPromoIdV1(shared);
  const id12 = supermarketPromoIdV1(shared);
  const id24 = supermarketPromoIdV1(shared);
  // v1: 3 cuotas / 12 cuotas / 24 cuotas ALL collapse → single id. This is
  // the bug the 2026-04-23 fix resolves. If v1 ever started distinguishing
  // these, this test would fail and the migration story would need updating.
  assert.strictEqual(id3, id12);
  assert.strictEqual(id12, id24);
});

test('supermarket: v2 id distinguishes distinct cuotas tiers (fix)', () => {
  const shared = {
    source_url: 'https://www.jumbo.com.ar/descuentos-del-dia',
    day_key: '0,1,2,3,4,5,6',
    banks_key: 'cencopay',
    wallets_key: '_none_',
    pct: 0,
    promo_type: 'cuotas',
  };
  const id3 = supermarketPromoId({ ...shared, variant_key: 'c3' });
  const id6 = supermarketPromoId({ ...shared, variant_key: 'c6' });
  const id12 = supermarketPromoId({ ...shared, variant_key: 'c12' });
  const id24 = supermarketPromoId({ ...shared, variant_key: 'c24' });
  // All four distinct — collision resolved.
  assert.strictEqual(new Set([id3, id6, id12, id24]).size, 4, 'v2 distinguishes all cuotas tiers');
});

test('supermarket: v2 id distinguishes multi-bank promos that share a primary bank', () => {
  // Under v1, two Carrefour blocks (Saturdays, 10%) with banks [bbva, galicia]
  // and [bbva, santander] would share primaryBank = 'bbva' and collide.
  // Under v2, banks_key captures the full composition, so they differ.
  const base = {
    source_url: 'https://www.carrefour.com.ar/descuentos-bancarios',
    day_key: '6',
    wallets_key: '_none_',
    pct: 10,
    promo_type: 'cashback',
    variant_key: '',
  };
  const a = supermarketPromoId({ ...base, banks_key: banksKey(['bbva', 'galicia']) });
  const b = supermarketPromoId({ ...base, banks_key: banksKey(['bbva', 'santander']) });
  assert.notStrictEqual(a, b, 'multi-bank promos with shared primary do NOT collide under v2');
});

// =============================================================================
// banksKey / walletsKey / variantKey — unit contract
// =============================================================================

test('supermarket: banksKey sorts + dedupes + joins with pipe', () => {
  assert.strictEqual(banksKey([]), '_none_');
  assert.strictEqual(banksKey(['galicia']), 'galicia');
  assert.strictEqual(banksKey(['Galicia', 'BBVA']), 'bbva|galicia');
  // Dedup.
  assert.strictEqual(banksKey(['galicia', 'GALICIA', ' galicia ']), 'galicia');
  // Order-independence.
  assert.strictEqual(
    banksKey(['bbva', 'galicia', 'santander']),
    banksKey(['santander', 'galicia', 'bbva']),
  );
});

test('supermarket: walletsKey sorts + dedupes + joins with pipe', () => {
  assert.strictEqual(walletsKey([]), '_none_');
  assert.strictEqual(walletsKey(['modo']), 'modo');
  assert.strictEqual(
    walletsKey(['modo', 'cuentadni', 'mercadopago']),
    'cuentadni|mercadopago|modo',
  );
  assert.strictEqual(walletsKey(['modo', 'MODO', ' modo ']), 'modo');
});

test('supermarket: variantKey for cuotas emits cNN token', () => {
  assert.strictEqual(
    variantKey({ promo_type: 'cuotas', cuotas_count: 3, tope: null, tope_period: null }),
    'c3',
  );
  assert.strictEqual(
    variantKey({ promo_type: 'cuotas', cuotas_count: 24, tope: null, tope_period: null }),
    'c24',
  );
  // Gemini float jitter: 12.0 → 12
  assert.strictEqual(
    variantKey({ promo_type: 'cuotas', cuotas_count: 12.0, tope: null, tope_period: null }),
    'c12',
  );
  // Missing cuotas_count → empty token. The row is kept (can't prove which
  // tier it is), but the collision risk is acknowledged.
  assert.strictEqual(
    variantKey({ promo_type: 'cuotas', cuotas_count: null, tope: null, tope_period: null }),
    '',
  );
  assert.strictEqual(
    variantKey({ promo_type: 'cuotas', cuotas_count: undefined, tope: null, tope_period: null }),
    '',
  );
});

test('supermarket: variantKey for cashback/mixed emits tope signature', () => {
  assert.strictEqual(
    variantKey({ promo_type: 'cashback', cuotas_count: null, tope: 20000, tope_period: 'month' }),
    '20000:month',
  );
  assert.strictEqual(
    variantKey({ promo_type: 'cashback', cuotas_count: null, tope: 10000, tope_period: 'week' }),
    '10000:week',
  );
  // Null tope → empty.
  assert.strictEqual(
    variantKey({ promo_type: 'cashback', cuotas_count: null, tope: null, tope_period: null }),
    '',
  );
  assert.strictEqual(
    variantKey({ promo_type: 'mixed', cuotas_count: null, tope: 5000, tope_period: 'ticket' }),
    '5000:ticket',
  );
});

// =============================================================================
// normalizeWallets — canonical enum + synonym resolution
// =============================================================================

test('supermarket: normalizeWallets maps synonyms to canonical values', () => {
  assert.deepStrictEqual(normalizeWallets(['MODO']), ['modo']);
  assert.deepStrictEqual(normalizeWallets(['Mercado Pago']), ['mercadopago']);
  assert.deepStrictEqual(normalizeWallets(['Cuenta DNI']), ['cuentadni']);
  assert.deepStrictEqual(normalizeWallets(['Ualá']), ['uala']);
  assert.deepStrictEqual(normalizeWallets(['Naranja X']), ['naranjax']);
  assert.deepStrictEqual(normalizeWallets(['Personal Pay']), ['personalpay']);
  assert.deepStrictEqual(normalizeWallets(['BNA+']), ['bna_plus']);
  assert.deepStrictEqual(normalizeWallets(['Jumbo+']), ['jumbo_mas']);
  assert.deepStrictEqual(normalizeWallets(['Mi Carrefour']), ['mi_carrefour']);
  assert.deepStrictEqual(normalizeWallets(['Comunidad Coto']), ['comunidad_coto']);
});

test('supermarket: normalizeWallets drops unknown tokens', () => {
  assert.deepStrictEqual(normalizeWallets(['Random Wallet', 'modo']), ['modo']);
  assert.deepStrictEqual(normalizeWallets([]), []);
  assert.deepStrictEqual(normalizeWallets(undefined), []);
});

test('supermarket: normalizeWallets dedupes and sorts stably', () => {
  const a = normalizeWallets(['modo', 'cuentadni', 'modo']);
  const b = normalizeWallets(['cuentadni', 'modo']);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, ['cuentadni', 'modo']);
});

// =============================================================================
// normalizeBanks — lowercased, whitespace-stripped, deduped, sorted
// =============================================================================

test('supermarket: normalizeBanks lowercases + dedupes + sorts', () => {
  assert.deepStrictEqual(normalizeBanks(['Galicia', 'BBVA', 'galicia']), [
    'bbva',
    'galicia',
  ]);
  // Accent-stripped for "Ciudadanía Porteña" → "ciudadaniaportena" style.
  assert.deepStrictEqual(normalizeBanks(['Ciudadanía Porteña']), ['ciudadaniaportena']);
  assert.deepStrictEqual(normalizeBanks([]), []);
  assert.deepStrictEqual(normalizeBanks(undefined), []);
});

// =============================================================================
// normalizeCardBrands — enum guard + "amex" synonyms
// =============================================================================

test('supermarket: normalizeCardBrands accepts canonical values', () => {
  assert.deepStrictEqual(normalizeCardBrands(['visa', 'mastercard']), ['mastercard', 'visa']);
  assert.deepStrictEqual(normalizeCardBrands(['Visa']), ['visa']);
  assert.deepStrictEqual(normalizeCardBrands(['AMEX']), ['amex']);
  assert.deepStrictEqual(normalizeCardBrands(['American Express']), ['amex']);
});

test('supermarket: normalizeCardBrands returns undefined for empty / unknown input', () => {
  assert.strictEqual(normalizeCardBrands(undefined), undefined);
  assert.strictEqual(normalizeCardBrands([]), undefined);
  assert.strictEqual(normalizeCardBrands(['unknown-brand']), undefined);
});
