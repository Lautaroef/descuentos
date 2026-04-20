// Unit tests for SSR filter parsing. Exercises every filter the URL supports, including
// the edge cases that PromoArg gets wrong (JS-only filters, fresh-tab / no-JS behavior).
//
// Run: pnpm test   (uses node:test via the project test script)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFilterFromParams,
  parseDayParam,
  parseRegionParam,
  parseSpendParam,
} from './filters.js';
import { effectiveSavings } from './queries-coerce.js';
import type { Promo } from './schema.js';

describe('parseFilterFromParams', () => {
  it('returns empty filter when no params are set', () => {
    const f = parseFilterFromParams(new URLSearchParams(''));
    assert.deepEqual(f, {
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: null,
      spend: 0,
    });
  });

  it('parses multi-select wallets from the legacy ?banco= key', () => {
    const f = parseFilterFromParams(new URLSearchParams('banco=modo,mercadopago'));
    assert.deepEqual(f.wallets, ['modo', 'mercadopago']);
  });

  it('parses multi-select wallets from the new ?wallet= key', () => {
    const f = parseFilterFromParams(new URLSearchParams('wallet=cuentadni,naranjax'));
    assert.deepEqual(f.wallets, ['cuentadni', 'naranjax']);
  });

  it('drops unknown wallet slugs silently', () => {
    const f = parseFilterFromParams(new URLSearchParams('wallet=modo,bogus,uala'));
    assert.deepEqual(f.wallets, ['modo', 'uala']);
  });

  it('parses multi-select categories from ?rubro=', () => {
    const f = parseFilterFromParams(new URLSearchParams('rubro=supermercado,farmacia'));
    assert.deepEqual(f.categories, ['supermercado', 'farmacia']);
  });

  it('parses issuer banks from ?issuer=', () => {
    const f = parseFilterFromParams(new URLSearchParams('issuer=galicia,bbva'));
    assert.deepEqual(f.banks, ['galicia', 'bbva']);
  });

  it('drops unknown bank slugs silently', () => {
    const f = parseFilterFromParams(new URLSearchParams('issuer=galicia,bogusbank'));
    assert.deepEqual(f.banks, ['galicia']);
  });

  it('parses an explicit weekday number', () => {
    const f = parseFilterFromParams(new URLSearchParams('dia=3'));
    assert.equal(f.day, 3);
  });

  it('resolves ?dia=hoy against the clock', () => {
    // Force a Wednesday (2026-04-22, dow=3).
    const f = parseFilterFromParams(new URLSearchParams('dia=hoy'), new Date('2026-04-22T12:00:00Z'));
    assert.equal(f.day, 3);
  });

  it('resolves ?dia=manana with wraparound across Saturday', () => {
    // Saturday 2026-04-18 → Sunday (0).
    const f = parseFilterFromParams(new URLSearchParams('dia=manana'), new Date('2026-04-18T12:00:00Z'));
    assert.equal(f.day, 0);
  });

  it('ignores ?dia=cualquiera', () => {
    const f = parseFilterFromParams(new URLSearchParams('dia=cualquiera'));
    assert.equal(f.day, null);
  });

  it('ignores garbage ?dia= values', () => {
    const f = parseFilterFromParams(new URLSearchParams('dia=banana'));
    assert.equal(f.day, null);
  });

  it('parses region=CABA', () => {
    const f = parseFilterFromParams(new URLSearchParams('region=CABA'));
    assert.equal(f.region, 'CABA');
  });

  it('parses region=AR-B (Buenos Aires province)', () => {
    const f = parseFilterFromParams(new URLSearchParams('region=AR-B'));
    assert.equal(f.region, 'AR-B');
  });

  it('rejects SQL-ish region values', () => {
    const f = parseFilterFromParams(new URLSearchParams("region=CABA' OR 1=1--"));
    assert.equal(f.region, null);
  });

  it('accepts a Next.js-style searchParams object (arrays + scalars)', () => {
    const f = parseFilterFromParams({
      wallet: 'modo',
      rubro: ['supermercado', 'farmacia'],
      dia: '3',
      region: 'CABA',
    });
    assert.deepEqual(f.wallets, ['modo']);
    assert.deepEqual(f.categories, ['supermercado']); // array → first element
    assert.equal(f.day, 3);
    assert.equal(f.region, 'CABA');
  });

  it('combines every filter in one URL (the "shared link" case)', () => {
    const f = parseFilterFromParams(
      new URLSearchParams(
        'wallet=modo,cuentadni&rubro=supermercado&issuer=galicia&dia=3&region=CABA&spend=40000',
      ),
    );
    assert.deepEqual(f, {
      wallets: ['modo', 'cuentadni'],
      categories: ['supermercado'],
      banks: ['galicia'],
      day: 3,
      region: 'CABA',
      spend: 40_000,
    });
  });

  it('parses a positive integer spend param', () => {
    const f = parseFilterFromParams(new URLSearchParams('spend=30000'));
    assert.equal(f.spend, 30_000);
  });

  it('drops non-numeric spend silently', () => {
    const f = parseFilterFromParams(new URLSearchParams('spend=nope'));
    assert.equal(f.spend, 0);
  });

  it('drops negative spend silently', () => {
    const f = parseFilterFromParams(new URLSearchParams('spend=-5000'));
    assert.equal(f.spend, 0);
  });
});

describe('parseDayParam', () => {
  it('treats 0 (Sunday) as valid', () => {
    assert.equal(parseDayParam('0'), 0);
  });

  it('rejects 7 (out of range)', () => {
    assert.equal(parseDayParam('7'), null);
  });

  it('rejects floats', () => {
    assert.equal(parseDayParam('3.5'), null);
  });
});

describe('parseRegionParam', () => {
  it('accepts AR', () => {
    assert.equal(parseRegionParam('AR'), 'AR');
  });

  it('accepts CABA (non-ISO but common AR usage)', () => {
    assert.equal(parseRegionParam('CABA'), 'CABA');
  });

  it('trims whitespace', () => {
    assert.equal(parseRegionParam('  AR-B  '), 'AR-B');
  });

  it('rejects empty strings', () => {
    assert.equal(parseRegionParam(''), null);
    assert.equal(parseRegionParam('   '), null);
  });
});

describe('parseSpendParam', () => {
  it('returns 0 for null / undefined / empty', () => {
    assert.equal(parseSpendParam(null), 0);
    assert.equal(parseSpendParam(undefined), 0);
    assert.equal(parseSpendParam(''), 0);
    assert.equal(parseSpendParam('   '), 0);
  });

  it('parses a plain integer', () => {
    assert.equal(parseSpendParam('30000'), 30_000);
    assert.equal(parseSpendParam('40000'), 40_000);
  });

  it('rejects non-numeric input', () => {
    assert.equal(parseSpendParam('40k'), 0);
    assert.equal(parseSpendParam('40.000'), 0);
    assert.equal(parseSpendParam('40,000'), 0);
    assert.equal(parseSpendParam('abc'), 0);
  });

  it('rejects negatives / signed values', () => {
    assert.equal(parseSpendParam('-5000'), 0);
    assert.equal(parseSpendParam('+5000'), 0);
  });

  it('caps at 100_000_000', () => {
    assert.equal(parseSpendParam('100000000000'), 100_000_000);
  });
});

// -----------------------------------------------------------------------------
// effectiveSavings — the ranking formula. Mirrors the SQL expression in listPromos.
// -----------------------------------------------------------------------------

type RankableBits = Pick<Promo, 'pct' | 'tope' | 'promo_type'>;

function rankable(bits: Partial<RankableBits> & { pct: number }): RankableBits {
  return {
    pct: bits.pct,
    tope: bits.tope ?? null,
    promo_type: bits.promo_type ?? 'cashback',
  };
}

describe('effectiveSavings — the spend-aware ranking formula', () => {
  it('returns 0 when spend is 0 (no spend context)', () => {
    assert.equal(effectiveSavings(rankable({ pct: 35, tope: 25_000 }), 0), 0);
  });

  it('returns 0 when spend is negative', () => {
    assert.equal(effectiveSavings(rankable({ pct: 35, tope: 25_000 }), -1), 0);
  });

  it('cashback with tope — returns LEAST(pct*spend/100, tope)', () => {
    // $40k × 35% = $14k, below the $25k tope → uncapped.
    assert.equal(
      effectiveSavings(rankable({ pct: 35, tope: 25_000 }), 40_000),
      14_000,
    );
    // $40k × 10% = $4k, below the $35k tope.
    assert.equal(
      effectiveSavings(rankable({ pct: 10, tope: 35_000 }), 40_000),
      4_000,
    );
  });

  it('cashback with tope — caps at tope when pct*spend exceeds it', () => {
    // $100k × 35% = $35k, capped at $25k tope.
    assert.equal(
      effectiveSavings(rankable({ pct: 35, tope: 25_000 }), 100_000),
      25_000,
    );
  });

  it('sin-tope (tope === null) — returns pct*spend/100 uncapped', () => {
    assert.equal(
      effectiveSavings(rankable({ pct: 25, tope: null }), 40_000),
      10_000,
    );
  });

  it('cuotas promo_type — always returns 0 regardless of pct/tope', () => {
    assert.equal(
      effectiveSavings(rankable({ pct: 30, tope: 25_000, promo_type: 'cuotas' }), 40_000),
      0,
    );
  });

  it('pct === 0 — returns 0 even for cashback/mixed', () => {
    assert.equal(
      effectiveSavings(rankable({ pct: 0, tope: 25_000 }), 40_000),
      0,
    );
  });

  it('mixed promo_type — computed the same as cashback', () => {
    assert.equal(
      effectiveSavings(rankable({ pct: 20, tope: 10_000, promo_type: 'mixed' }), 40_000),
      8_000,
    );
  });

  it('integer math — no fractional cents', () => {
    // 40001 × 35 / 100 = 14000.35 → floor to 14000.
    assert.equal(
      effectiveSavings(rankable({ pct: 35, tope: 25_000 }), 40_001),
      14_000,
    );
  });

  it('ceiling spend (100_000_000) caps at tope', () => {
    assert.equal(
      effectiveSavings(rankable({ pct: 10, tope: 35_000 }), 100_000_000),
      35_000,
    );
  });

  // The persona scenario from docs/design/ux-audit.md:
  // $40k budget, Carrefour 10% tope $35k = $4k; Carrefour 35% tope $25k = $14k.
  it('ranks the persona scenario correctly (40k supermarket budget)', () => {
    const carrefour10 = effectiveSavings(rankable({ pct: 10, tope: 35_000 }), 40_000);
    const carrefour35 = effectiveSavings(rankable({ pct: 35, tope: 25_000 }), 40_000);
    const coto25 = effectiveSavings(rankable({ pct: 25, tope: 30_000 }), 40_000);
    assert.equal(carrefour10, 4_000);
    assert.equal(carrefour35, 14_000);
    assert.equal(coto25, 10_000);
    // 35% card should outrank the 10% one.
    assert.ok(carrefour35 > carrefour10);
    // 25% with $30k tope also beats the 10% one.
    assert.ok(coto25 > carrefour10);
  });

  it('sin-tope beats tope-capped when spend is small', () => {
    // $5k spend: sin-tope 10% = $500. Tope-capped 35% tope $200 = min($1750, $200) = $200.
    const sinTope = effectiveSavings(rankable({ pct: 10, tope: null }), 5_000);
    const capped = effectiveSavings(rankable({ pct: 35, tope: 200 }), 5_000);
    assert.equal(sinTope, 500);
    assert.equal(capped, 200);
    assert.ok(sinTope > capped);
  });
});
