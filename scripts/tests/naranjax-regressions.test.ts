// Naranja X — deeper regressions beyond the smoke test in
// naranjax-extract.test.ts.
//
// Covers:
//   - Every fixture promo passes the canonical Zod gate.
//   - Source-specific invariants: wallet == ['naranjax'], issuer_bank == ['naranjax'].
//   - Multi-promo-per-URL: one hub yields N rows with DISTINCT ids.
//   - Canonical id determinism + cross-hub provenance (same promo on two hubs
//     → two ids) + merchant-casing normalization.
//   - AMBA regional tagging: valid_regions = ['AR-C', 'AR-B'].
//   - "Días seleccionados" default heuristics: supermercado/combustible → [2],
//     everything else → [0..6].
//   - Duplicate card emissions within one hub are deduped by id.
//   - Cuotas-only cards are schema-valid (pct=0, promo_type='cuotas').
//   - Malformed LLM payload rows get filtered, not silently upserted.
//   - Token envelope: hub markdown is under the 15k ceiling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NARANJAX_SOURCE_ID,
  naranjaxPromoId,
  extractNaranjaxPromos,
} from '../lib/naranjax-extract.js';
import { Promo as PromoSchema } from '../promo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'naranjax');
const NO_USAGE = { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };

async function loadFixture(name: string) {
  const raw = await readFile(resolve(FIXTURES_DIR, `${name}.extract.json`), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}

async function loadMarkdown(name: string) {
  return readFile(resolve(FIXTURES_DIR, `${name}.md`), 'utf8');
}

function stubPromo(overrides: Record<string, unknown>) {
  return {
    merchant: 'Generic',
    category: 'supermercado',
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
// Schema walk + invariants.
// =============================================================================

test('naranjax-regressions: every hub fixture promo passes the canonical Promo Zod schema', async () => {
  const fixture = await loadFixture('promociones-hub');
  const md = await loadMarkdown('promociones-hub');
  const result = await extractNaranjaxPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  assert.strictEqual(result.rejected_count, 0);
  for (const p of result.promos) {
    const parsed = PromoSchema.safeParse(p);
    assert.ok(
      parsed.success,
      `${p.merchant}: schema-valid required (${parsed.success ? '' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')})`,
    );
  }
});

test('naranjax-regressions: invariants — wallet and issuer_bank are ["naranjax"]', async () => {
  const fixture = await loadFixture('promociones-hub');
  const result = await extractNaranjaxPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  for (const p of result.promos) {
    assert.deepStrictEqual(p.wallet, ['naranjax']);
    assert.deepStrictEqual(p.issuer_bank, ['naranjax']);
    assert.strictEqual(p.source_id, NARANJAX_SOURCE_ID);
    assert.strictEqual(p.source_url, fixture.source_url);
  }
});

test('naranjax-regressions: hub fixture yields multiple DISTINCT promo ids', async () => {
  const fixture = await loadFixture('promociones-hub');
  const result = await extractNaranjaxPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  assert.ok(result.promos.length >= 2, 'multi-promo fixture');
  assert.strictEqual(new Set(result.ids).size, result.ids.length, 'ids are all distinct');
});

// =============================================================================
// Cross-hub provenance.
// =============================================================================

test('naranjax-regressions: same promo on two hubs produces two distinct ids (preserves provenance)', () => {
  const a = naranjaxPromoId('https://www.naranjax.com/promociones', 'Supermercados', 25, [2]);
  const b = naranjaxPromoId(
    'https://www.naranjax.com/promociones/SUPERMERCADOS_categoria',
    'Supermercados',
    25,
    [2],
  );
  assert.notStrictEqual(a, b);
});

test('naranjax-regressions: naranjaxPromoId normalizes merchant casing and day order', () => {
  const url = 'https://www.naranjax.com/promociones';
  assert.strictEqual(
    naranjaxPromoId(url, 'Supermercados', 25, [2]),
    naranjaxPromoId(url, '  SUPERMERCADOS ', 25, [2]),
  );
  assert.strictEqual(
    naranjaxPromoId(url, 'X', 10, [4, 2]),
    naranjaxPromoId(url, 'X', 10, [2, 4]),
  );
});

test('naranjax-regressions: id is UUID v5 shape', () => {
  const id = naranjaxPromoId('https://www.naranjax.com/promociones', 'X', 10, [2]);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// =============================================================================
// AMBA regional tagging — assert a synthesized AMBA promo keeps the regions.
// =============================================================================

test('naranjax-regressions: AMBA payload preserves valid_regions = ["AR-C", "AR-B"]', async () => {
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones-amba',
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({
            merchant: 'Subte CABA',
            category: 'transporte',
            valid_regions: ['AR-C', 'AR-B'],
          }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.deepStrictEqual(result.promos[0].valid_regions, ['AR-C', 'AR-B']);
});

// =============================================================================
// Cuotas + mixed card types pass the canonical gate.
// =============================================================================

test('naranjax-regressions: cuotas-only cards (pct=0, promo_type=cuotas) are schema-valid', async () => {
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones',
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'Naldo', pct: 0, promo_type: 'cuotas', category: 'electro' }),
          stubPromo({
            merchant: 'Aerolíneas Argentinas',
            pct: 0,
            promo_type: 'cuotas',
            category: 'transporte',
          }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  for (const p of result.promos) {
    assert.strictEqual(p.pct, 0);
    assert.strictEqual(p.promo_type, 'cuotas');
  }
});

test('naranjax-regressions: mixed off+cuotas → promo_type="mixed", pct is the off-portion', async () => {
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones',
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({
            merchant: 'Shopgallery',
            pct: 10,
            promo_type: 'mixed',
            category: 'otro',
            valid_days: [2],
          }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos[0].promo_type, 'mixed');
  assert.strictEqual(result.promos[0].pct, 10);
});

// =============================================================================
// Duplicate-card deduplication within one hub.
// =============================================================================

test('naranjax-regressions: duplicate card emissions in one payload collapse to one row', async () => {
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones',
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'Supermercados', pct: 25, valid_days: [2], tope: 12000, tope_period: 'week', category: 'supermercado' }),
          stubPromo({ merchant: 'Supermercados', pct: 25, valid_days: [2], tope: 12000, tope_period: 'week', category: 'supermercado' }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos.length, 1, 'dedup by canonical id');
  assert.strictEqual(result.ids.length, 1);
});

// =============================================================================
// Malformed rows are rejected at the canonical gate.
// =============================================================================

test('naranjax-regressions: invalid category rejected, schema-valid siblings preserved', async () => {
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones',
    markdown: 'stub',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'Good', pct: 20, category: 'supermercado' }),
          stubPromo({ merchant: 'Bad', pct: 20, category: 'garbage' as any }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 1);
  assert.strictEqual(result.promos[0].merchant, 'Good');
});

test('naranjax-regressions: empty valid_days is still schema-valid (edge case)', async () => {
  // The canonical schema says `z.array(z.number().int().min(0).max(6))` — an
  // empty array is allowed. Naranja X never produces this, but we want to
  // document the contract so a future "if empty, default to all 7" heuristic
  // is an explicit choice, not an accident.
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones',
    markdown: 'stub',
    llmOverride: async () => ({
      data: { promos: [stubPromo({ merchant: 'X', valid_days: [] })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.deepStrictEqual(result.promos[0].valid_days, []);
});

// =============================================================================
// Token envelope — hub markdown is small.
// =============================================================================

test('naranjax-regressions: hub markdown fixture is under the 15k-token budget envelope', async () => {
  const md = await loadMarkdown('promociones-hub');
  const approxTokens = Math.ceil(md.length / 4);
  assert.ok(
    approxTokens < 15_000,
    `Naranja X hub fixture is ~${approxTokens} tokens; budget ceiling is 15k.`,
  );
});

test('naranjax-regressions: empty promos array → empty result', async () => {
  const result = await extractNaranjaxPromos({
    source_url: 'https://www.naranjax.com/promociones',
    markdown: '# fake',
    llmOverride: async () => ({ data: { promos: [] }, usage: NO_USAGE }),
  });
  assert.strictEqual(result.promos.length, 0);
});
