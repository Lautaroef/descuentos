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
} from './filters.js';

describe('parseFilterFromParams', () => {
  it('returns empty filter when no params are set', () => {
    const f = parseFilterFromParams(new URLSearchParams(''));
    assert.deepEqual(f, {
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: null,
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
      new URLSearchParams('wallet=modo,cuentadni&rubro=supermercado&issuer=galicia&dia=3&region=CABA'),
    );
    assert.deepEqual(f, {
      wallets: ['modo', 'cuentadni'],
      categories: ['supermercado'],
      banks: ['galicia'],
      day: 3,
      region: 'CABA',
    });
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
