// Behavior contract for the merchant / wallet / bank logo resolver.
//
// Tests verify:
//   - Top-N merchants resolve to a non-null URL (coverage audit promise)
//   - Generic "adheridos"-style strings fall through to null (no fake logos)
//   - Diacritic + casing variance is normalized ("Aerolíneas" == "aerolineas")
//   - Wallet + bank slugs have exhaustive domain coverage for the current enums
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bankLogoUrl,
  isGenericMerchant,
  merchantLogoUrl,
  normalizeMerchantKey,
  walletLogoUrl,
  WALLET_DOMAINS,
  BANK_DOMAINS,
} from './logos.js';
import { WALLET_SLUGS, BANK_SLUGS } from './constants.js';

describe('logos — merchantLogoUrl', () => {
  it('resolves top-tier chains to a favicon URL', () => {
    for (const m of ['Coto', 'Carrefour', 'Jumbo', 'Disco', 'Vea', 'Dia', 'Farmacity', 'YPF']) {
      const url = merchantLogoUrl(m);
      assert.ok(url && url.startsWith('https://www.google.com/s2/favicons'), `missing logo for ${m}`);
    }
  });

  it('normalizes diacritics and case', () => {
    const a = merchantLogoUrl('Aerolíneas Argentinas');
    const b = merchantLogoUrl('aerolineas argentinas');
    const c = merchantLogoUrl('AEROLINEAS ARGENTINAS');
    assert.ok(a);
    assert.equal(a, b);
    assert.equal(a, c);
  });

  it('returns null for generic placeholder merchants', () => {
    for (const m of [
      'Comercios adheridos',
      'Farmacias adheridas',
      'Supermercados del interior',
      'Marcas destacadas',
      'Librerías',
      'Ferias y mercados bonaerenses',
    ]) {
      assert.equal(merchantLogoUrl(m), null, `expected null for generic "${m}"`);
    }
  });

  it('returns null for unknown one-off merchants', () => {
    assert.equal(merchantLogoUrl('Alba la Pérgola'), null);
    assert.equal(merchantLogoUrl('Los Silos Hotel'), null);
  });

  it('returns null for nullish / empty inputs', () => {
    assert.equal(merchantLogoUrl(''), null);
    assert.equal(merchantLogoUrl(null), null);
    assert.equal(merchantLogoUrl(undefined), null);
  });

  it('prefix match covers variant spellings — "Disco & Vea" maps to disco', () => {
    const url = merchantLogoUrl('Disco & Vea');
    assert.ok(url);
    assert.ok(url.includes('disco.com.ar'));
  });
});

describe('logos — normalizeMerchantKey', () => {
  it('strips accents, lowercases, collapses whitespace', () => {
    assert.equal(normalizeMerchantKey('Aerolíneas  Argentinas'), 'aerolineas argentinas');
    assert.equal(normalizeMerchantKey('COTO'), 'coto');
    assert.equal(normalizeMerchantKey('La Anónima'), 'la anonima');
  });

  it('replaces punctuation with spaces', () => {
    assert.equal(normalizeMerchantKey('Le Pain Quotidien / LPQ'), 'le pain quotidien lpq');
  });
});

describe('logos — isGenericMerchant', () => {
  it('detects placeholders built on "adheridos"', () => {
    assert.equal(isGenericMerchant('Supermercados adheridos'), true);
    assert.equal(isGenericMerchant('Farmacias adheridas'), true);
    assert.equal(isGenericMerchant('Comercios adheridos'), true);
    assert.equal(isGenericMerchant('Veterinarias y Pet Shops adheridos'), true);
  });

  it('keeps real merchants out of the generic set', () => {
    assert.equal(isGenericMerchant('Coto'), false);
    assert.equal(isGenericMerchant('Carrefour'), false);
    assert.equal(isGenericMerchant('Nike'), false);
  });
});

describe('logos — walletLogoUrl', () => {
  it('every WALLET_SLUGS entry has a domain mapping', () => {
    for (const slug of WALLET_SLUGS) {
      assert.ok(WALLET_DOMAINS[slug], `missing wallet domain for ${slug}`);
      const url = walletLogoUrl(slug);
      assert.ok(url && url.includes(WALLET_DOMAINS[slug]), `missing favicon URL for ${slug}`);
    }
  });

  it('returns null for unknown slugs', () => {
    assert.equal(walletLogoUrl('nonsense'), null);
  });
});

describe('logos — bankLogoUrl', () => {
  it('every BANK_SLUGS entry has a domain mapping', () => {
    for (const slug of BANK_SLUGS) {
      assert.ok(BANK_DOMAINS[slug], `missing bank domain for ${slug}`);
      const url = bankLogoUrl(slug);
      assert.ok(url && url.includes(BANK_DOMAINS[slug]), `missing favicon URL for ${slug}`);
    }
  });
});
