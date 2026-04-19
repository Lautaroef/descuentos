// Unit tests for `coerce` — the DB row → UI `Promo` normalizer.
//
// Run: `pnpm test` (node:test). Lives in scripts/tests/ so Vitest's bundler doesn't try
// to pick it up (Vite can't bundle `node:test`).
//
// The key contract is P2-14 (docs/testing.md + Agent 1 note): every Zod-optional field
// must surface as `undefined` when the DB column is NULL. Postgres-js delivers NULL
// columns as JS `null`, which fails `Zod.optional()` re-parses. The coerce step
// deliberately converts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coerce, toIsoDate, type PromoRowRaw } from '../../src/lib/queries-coerce.js';

// Minimal row with the required fields set; optionals default to null unless overridden.
function makeRow(overrides: Partial<PromoRowRaw> = {}): PromoRowRaw {
  return {
    id: '00000000-0000-5000-8000-000000000000',
    source_id: 'modo',
    source_url: 'https://www.modo.com.ar/promos/test-slug',
    merchant: 'Test Merchant',
    category: 'supermercado',
    wallet: ['modo'],
    card_brand: null,
    issuer_bank: null,
    pct: '15',
    promo_type: 'cashback',
    tope: '5000',
    tope_period: 'month',
    valid_days: [2, 3],
    valid_regions: [],
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    requires_min_spend: null,
    stacks_with: null,
    variants: null,
    last_seen_at: '2026-04-18T00:00:00Z',
    ...overrides,
  };
}

describe('coerce (P2-14: NULL → undefined for Zod-optional fields)', () => {
  it('turns NULL card_brand into undefined (not null)', () => {
    const p = coerce(makeRow({ card_brand: null }));
    assert.strictEqual(p.card_brand, undefined);
  });

  it('turns NULL issuer_bank into undefined', () => {
    const p = coerce(makeRow({ issuer_bank: null }));
    assert.strictEqual(p.issuer_bank, undefined);
  });

  it('turns NULL stacks_with into undefined', () => {
    const p = coerce(makeRow({ stacks_with: null }));
    assert.strictEqual(p.stacks_with, undefined);
  });

  it('turns NULL variants into undefined', () => {
    const p = coerce(makeRow({ variants: null }));
    assert.strictEqual(p.variants, undefined);
  });

  it('preserves non-null card_brand as-is', () => {
    const p = coerce(makeRow({ card_brand: ['visa', 'mastercard'] }));
    assert.deepStrictEqual(p.card_brand, ['visa', 'mastercard']);
  });

  it('preserves non-null issuer_bank as-is', () => {
    const p = coerce(makeRow({ issuer_bank: ['galicia', 'bbva'] }));
    assert.deepStrictEqual(p.issuer_bank, ['galicia', 'bbva']);
  });
});

describe('coerce — numeric normalization', () => {
  it('coerces pct from string to number', () => {
    const p = coerce(makeRow({ pct: '17.5' }));
    assert.strictEqual(p.pct, 17.5);
  });

  it('passes through numeric pct unchanged', () => {
    const p = coerce(makeRow({ pct: 15 }));
    assert.strictEqual(p.pct, 15);
  });

  it('coerces tope from string to number', () => {
    const p = coerce(makeRow({ tope: '8000' }));
    assert.strictEqual(p.tope, 8000);
  });

  it('leaves tope null when DB returns null', () => {
    const p = coerce(makeRow({ tope: null }));
    assert.strictEqual(p.tope, null);
  });

  it('coerces requires_min_spend from string to number', () => {
    const p = coerce(makeRow({ requires_min_spend: '1200' }));
    assert.strictEqual(p.requires_min_spend, 1200);
  });

  it('leaves requires_min_spend null when DB returns null', () => {
    const p = coerce(makeRow({ requires_min_spend: null }));
    assert.strictEqual(p.requires_min_spend, null);
  });
});

describe('coerce — date / timestamp normalization', () => {
  it('normalizes Date valid_from → YYYY-MM-DD string', () => {
    const p = coerce(makeRow({ valid_from: new Date('2026-02-15T00:00:00Z') }));
    assert.strictEqual(p.valid_from, '2026-02-15');
  });

  it('truncates string valid_from to YYYY-MM-DD', () => {
    const p = coerce(makeRow({ valid_from: '2026-02-15T00:00:00.000Z' }));
    assert.strictEqual(p.valid_from, '2026-02-15');
  });

  it('normalizes Date last_seen_at → ISO string', () => {
    const d = new Date('2026-04-18T12:34:56.000Z');
    const p = coerce(makeRow({ last_seen_at: d }));
    assert.strictEqual(p.last_seen_at, '2026-04-18T12:34:56.000Z');
  });

  it('passes string last_seen_at through', () => {
    const p = coerce(makeRow({ last_seen_at: '2026-04-18T12:34:56.000Z' }));
    assert.strictEqual(p.last_seen_at, '2026-04-18T12:34:56.000Z');
  });

  it('leaves updated_at undefined when DB omits it', () => {
    const row = makeRow();
    delete row.updated_at;
    const p = coerce(row);
    assert.strictEqual(p.updated_at, undefined);
  });

  it('normalizes Date updated_at → ISO string when present', () => {
    const p = coerce(
      makeRow({ updated_at: new Date('2026-04-18T10:00:00.000Z') }),
    );
    assert.strictEqual(p.updated_at, '2026-04-18T10:00:00.000Z');
  });
});

describe('coerce — array defaults', () => {
  it('coerces null valid_days to []', () => {
    // postgres-js may return null for empty arrays under some tier quirks; defensively default.
    const p = coerce(makeRow({ valid_days: null as unknown as number[] }));
    assert.deepStrictEqual(p.valid_days, []);
  });

  it('coerces null valid_regions to []', () => {
    const p = coerce(makeRow({ valid_regions: null as unknown as string[] }));
    assert.deepStrictEqual(p.valid_regions, []);
  });
});

describe('toIsoDate', () => {
  it('slices a string timestamp to YYYY-MM-DD', () => {
    assert.strictEqual(toIsoDate('2026-04-18T12:34:56.000Z'), '2026-04-18');
  });

  it('returns plain date strings unchanged (already 10 chars)', () => {
    assert.strictEqual(toIsoDate('2026-04-18'), '2026-04-18');
  });

  it('formats a Date object as YYYY-MM-DD', () => {
    assert.strictEqual(toIsoDate(new Date('2026-04-18T23:59:59Z')), '2026-04-18');
  });
});
