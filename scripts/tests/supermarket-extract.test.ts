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
  dayKey,
  primaryBank,
  canonicalPct,
  canonicalPromoType,
  normalizeWallets,
  normalizeBanks,
  normalizeCardBrands,
  supermarketPromoId,
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
// supermarketPromoId — determinism + tuple semantics
// =============================================================================

test('supermarket: supermarketPromoId is deterministic across identical tuples', () => {
  const t = {
    source_url: 'https://example.com/a',
    day_key: '1,3',
    bank_key: 'galicia',
    pct: 20,
    promo_type: 'cashback',
  };
  const a = supermarketPromoId(t);
  const b = supermarketPromoId({ ...t });
  assert.strictEqual(a, b);
  // UUID v5 shape.
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('supermarket: supermarketPromoId differs per tuple component', () => {
  const base = {
    source_url: 'https://example.com/a',
    day_key: '1',
    bank_key: 'galicia',
    pct: 20,
    promo_type: 'cashback',
  };
  const baseId = supermarketPromoId(base);
  assert.notStrictEqual(
    baseId,
    supermarketPromoId({ ...base, source_url: 'https://example.com/b' }),
  );
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, day_key: '2' }));
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, bank_key: 'macro' }));
  assert.notStrictEqual(baseId, supermarketPromoId({ ...base, pct: 30 }));
  assert.notStrictEqual(
    baseId,
    supermarketPromoId({ ...base, promo_type: 'cuotas' }),
  );
});

test('supermarket: supermarketPromoId is stable under Gemini-style pct drift', () => {
  // Core idempotency regression: Gemini sometimes emits `10` on one run and
  // `10.0`/`9.9999` on the next. The normalized id MUST stay byte-identical.
  const base = {
    source_url: 'https://example.com/a',
    day_key: '6',
    bank_key: 'carrefour',
    pct: 10,
    promo_type: 'cashback',
  };
  const id = supermarketPromoId(base);
  assert.strictEqual(supermarketPromoId({ ...base, pct: 10.0 }), id);
  assert.strictEqual(supermarketPromoId({ ...base, pct: 9.999999 }), id);
  assert.strictEqual(supermarketPromoId({ ...base, pct: 10.49 }), id);
});

test('supermarket: supermarketPromoId is stable under bank_key casing drift', () => {
  const base = {
    source_url: 'https://example.com/a',
    day_key: '6',
    bank_key: 'bbva',
    pct: 10,
    promo_type: 'cashback',
  };
  const id = supermarketPromoId(base);
  assert.strictEqual(supermarketPromoId({ ...base, bank_key: 'BBVA' }), id);
  assert.strictEqual(supermarketPromoId({ ...base, bank_key: ' bbva ' }), id);
});

test('supermarket: supermarketPromoId is stable under promo_type casing drift', () => {
  const base = {
    source_url: 'https://example.com/a',
    day_key: '1',
    bank_key: 'galicia',
    pct: 30,
    promo_type: 'cashback',
  };
  const id = supermarketPromoId(base);
  assert.strictEqual(supermarketPromoId({ ...base, promo_type: 'CASHBACK' }), id);
  assert.strictEqual(supermarketPromoId({ ...base, promo_type: ' cashback ' }), id);
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
