// Personal Pay — deeper regressions.
//
// THE core invariant this source must uphold (see docs/sources/personalpay.md):
// every emitted Promo has `tope === null` and `tope_period === null`. Topes are
// image-locked + auth-gated; we do not invent them.
//
// Phase 3.3 fix: the extractor now FORCES tope=null + tope_period=null instead
// of trusting the LLM output. This test file locks in that behavior and adds
// the usual schema walk + day-phrase parsing + id determinism coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERSONALPAY_SOURCE_ID,
  PERSONALPAY_SOURCE_URL,
  personalpayPromoId,
  extractPersonalPayPromos,
} from '../lib/personalpay-extract.js';
import { Promo as PromoSchema } from '../promo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'personalpay');
const NO_USAGE = { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };

async function loadFixture() {
  const raw = await readFile(resolve(FIXTURES_DIR, 'beneficios.extract.json'), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}
async function loadMarkdown() {
  return readFile(resolve(FIXTURES_DIR, 'beneficios.md'), 'utf8');
}

function stubPromo(overrides: Record<string, unknown>) {
  return {
    merchant: 'Farmalife',
    category: 'farmacia',
    pct: 10,
    tope: null,
    tope_period: null,
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    promo_type: 'cashback',
    ...overrides,
  };
}

// =============================================================================
// Schema walk + the tope-null invariant.
// =============================================================================

test('personalpay-regressions: every fixture promo passes the canonical Promo schema', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const result = await extractPersonalPayPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  assert.strictEqual(result.rejected_count, 0);
  for (const p of result.promos) {
    const parsed = PromoSchema.safeParse(p);
    assert.ok(parsed.success);
  }
});

test('personalpay-regressions: every fixture row has tope=null AND tope_period=null', async () => {
  const fixture = await loadFixture();
  const result = await extractPersonalPayPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  for (const p of result.promos) {
    assert.strictEqual(p.tope, null, `${p.merchant}: tope must be null`);
    assert.strictEqual(p.tope_period, null, `${p.merchant}: tope_period must be null`);
  }
});

test('personalpay-regressions: HARD INVARIANT — hallucinated topes from Gemini are FORCED to null', async () => {
  // This is the Phase 3.3 tightening. If Gemini ever starts emitting topes
  // (hallucinated from press content, accidentally OCRed, whatever), the
  // extractor overwrites them. Upholds the partial-coverage contract in
  // docs/sources/personalpay.md without a schema-level refine.
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'Hallucinated', pct: 20, tope: 5000, tope_period: 'month' }),
          stubPromo({ merchant: 'Also Hallucinated', pct: 10, tope: 8000, tope_period: 'week' }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  for (const p of result.promos) {
    assert.strictEqual(p.tope, null, `${p.merchant}: hallucinated tope was forced to null`);
    assert.strictEqual(p.tope_period, null);
  }
});

test('personalpay-regressions: source_id and wallet pinned on every row', async () => {
  const fixture = await loadFixture();
  const result = await extractPersonalPayPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  for (const p of result.promos) {
    assert.strictEqual(p.source_id, PERSONALPAY_SOURCE_ID);
    assert.strictEqual(p.source_url, fixture.source_url);
    assert.deepStrictEqual(p.wallet, ['personalpay']);
    assert.deepStrictEqual(p.issuer_bank, ['personalpay']);
  }
});

// =============================================================================
// Canonical id determinism.
// =============================================================================

test('personalpay-regressions: personalpayPromoId is deterministic + distinct per tuple', () => {
  const url = PERSONALPAY_SOURCE_URL;
  const a = personalpayPromoId(url, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]);
  const b = personalpayPromoId(url, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]);
  assert.strictEqual(a, b);
  // Day-order reorder stays stable.
  assert.strictEqual(a, personalpayPromoId(url, 'Farmalife', 10, [6, 5, 4, 3, 2, 1, 0]));
  // Merchant casing normalized.
  assert.strictEqual(a, personalpayPromoId(url, '  FARMALIFE  ', 10, [0, 1, 2, 3, 4, 5, 6]));
  // Different pct/days/merchant → different id.
  assert.notStrictEqual(a, personalpayPromoId(url, 'Farmalife', 10, [1]));
  assert.notStrictEqual(a, personalpayPromoId(url, 'Farmalife', 20, [0, 1, 2, 3, 4, 5, 6]));
  assert.notStrictEqual(a, personalpayPromoId(url, 'Farmacity', 10, [0, 1, 2, 3, 4, 5, 6]));
});

test('personalpay-regressions: id is UUID v5 shape', () => {
  const id = personalpayPromoId(PERSONALPAY_SOURCE_URL, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// =============================================================================
// Day-phrase corner cases.
// =============================================================================

test('personalpay-regressions: "Lunes a Miércoles" → [1,2,3] round-trip', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [stubPromo({ merchant: 'Taxi Premium', category: 'transporte', pct: 30, valid_days: [1, 2, 3] })],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.deepStrictEqual(result.promos[0].valid_days, [1, 2, 3]);
});

test('personalpay-regressions: "Lunes, Martes" → [1,2] comma list round-trip', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [stubPromo({ merchant: 'Lázaro', category: 'indumentaria', valid_days: [1, 2] })],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.deepStrictEqual(result.promos[0].valid_days, [1, 2]);
});

test('personalpay-regressions: "Fin de semana" → [0, 6] round-trip', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: { promos: [stubPromo({ merchant: 'WeekendOnly', valid_days: [0, 6] })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.deepStrictEqual(result.promos[0].valid_days, [0, 6]);
});

// =============================================================================
// Personal Flow duplicates — repeated merchant with different rates.
// =============================================================================

test('personalpay-regressions: same merchant with different rates → distinct rows (not deduped)', async () => {
  // "Personal Flow" appears 3× with 25%/10%/10%. The first two survive (distinct
  // pct → distinct id), the two 10% rows collapse because their tuple (merchant,
  // pct, days) is identical.
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'Personal Flow', pct: 25, category: 'otro' }),
          stubPromo({ merchant: 'Personal Flow', pct: 10, category: 'otro' }),
          stubPromo({ merchant: 'Personal Flow', pct: 10, category: 'otro' }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  // 25% and 10% — second 10% deduped by id.
  assert.strictEqual(result.promos.length, 2);
  const rates = result.promos.map((p) => p.pct).sort((a, b) => a - b);
  assert.deepStrictEqual(rates, [10, 25]);
});

// =============================================================================
// Malformed rows handled at canonical gate.
// =============================================================================

test('personalpay-regressions: invalid category rejected, good rows preserved', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'Good', pct: 20 }),
          stubPromo({ merchant: 'Bad', category: 'garbage' as any }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 1);
  assert.strictEqual(result.promos[0].merchant, 'Good');
});

test('personalpay-regressions: weekday > 6 is rejected', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({
      data: { promos: [stubPromo({ merchant: 'BadDay', valid_days: [7] })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 0);
});

// =============================================================================
// Empty / degenerate.
// =============================================================================

test('personalpay-regressions: empty promos array → empty result', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: [] }, usage: NO_USAGE }),
  });
  assert.strictEqual(result.promos.length, 0);
});

// =============================================================================
// Token envelope.
// =============================================================================

test('personalpay-regressions: hub markdown is comfortably under the 15k-token envelope', async () => {
  const md = await loadMarkdown();
  const approxTokens = Math.ceil(md.length / 4);
  assert.ok(approxTokens < 15_000, `Personal Pay fixture ~${approxTokens} tokens`);
});

// =============================================================================
// Idempotency.
// =============================================================================

test('personalpay-regressions: same payload twice → identical id set', async () => {
  const fixture = await loadFixture();
  const call = async () =>
    extractPersonalPayPromos({
      source_url: fixture.source_url,
      markdown: 'stub',
      llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
    });
  const a = await call();
  const b = await call();
  assert.deepStrictEqual([...a.ids].sort(), [...b.ids].sort());
});
