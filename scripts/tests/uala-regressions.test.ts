// Ualá — deeper regressions beyond the smoke test in uala-extract.test.ts.
//
// Covers:
//   - Fixture walk through the canonical Promo Zod gate.
//   - Invariants: wallet == ['uala'], issuer_bank default == ['uala'],
//     source_url shape is `https://www.uala.com.ar/promociones/<slug>`.
//   - Malformed LLM output (e.g., missing required merchant, invalid category)
//     THROWS from extractUalaPromo (not swallowed), because the per-url source
//     can't return a partial result for one detail page.
//   - Edge-case day-phrase-via-legal-text parsing: `[6]` for "sábados" plus
//     `[1,2,3,4,5]` for "lunes a viernes".
//   - Region coercion: "Buenos Aires" fixture → `['AR-B']`.
//   - Hub parser behavior: dedup + skip ignored slugs + sort.
//   - Slug normalization: URLs with tracking params / upper-case paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UALA_SOURCE_ID,
  ualaPromoId,
  ualaSourceUrl,
  extractUalaPromo,
} from '../lib/uala-extract.js';
import { parseHubSlugs } from '../ingestion/uala-hub.js';
import { Promo as PromoSchema } from '../promo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'uala');
const NO_USAGE = { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };

function stubLlm(overrides: Record<string, unknown>) {
  return {
    merchant: 'Carrefour',
    category: 'supermercado',
    pct: 10,
    tope: null,
    tope_period: null,
    valid_days: [6],
    valid_days_reasoning: 'los sábados',
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    issuer_bank: ['uala'],
    wallet: ['uala'],
    promo_type: 'mixed',
    ...overrides,
  };
}

async function loadFixture(name: string) {
  const raw = await readFile(resolve(FIXTURES_DIR, `${name}.extract.json`), 'utf8');
  return JSON.parse(raw) as {
    slug: string;
    source_url: string;
    data: Record<string, unknown>;
  };
}
async function loadMarkdown(name: string) {
  return readFile(resolve(FIXTURES_DIR, `${name}.md`), 'utf8');
}

// =============================================================================
// Schema conformance + invariants.
// =============================================================================

test('uala-regressions: fixture promo passes the canonical Promo Zod schema', async () => {
  const fixture = await loadFixture('promociones-carrefour');
  const md = await loadMarkdown('promociones-carrefour');
  const result = await extractUalaPromo({
    slug: fixture.slug,
    markdown: md,
    llmOverride: async () => ({ data: fixture.data as any, usage: NO_USAGE }),
  });
  const parsed = PromoSchema.safeParse(result.promo);
  assert.ok(parsed.success);
});

test('uala-regressions: source_url is canonical per slug (per-url tupling)', async () => {
  const fixture = await loadFixture('promociones-carrefour');
  const result = await extractUalaPromo({
    slug: fixture.slug,
    markdown: 'stub',
    llmOverride: async () => ({ data: fixture.data as any, usage: NO_USAGE }),
  });
  assert.strictEqual(result.promo.source_url, `https://www.uala.com.ar/promociones/${fixture.slug}`);
  assert.strictEqual(result.promo.source_id, UALA_SOURCE_ID);
  assert.deepStrictEqual(result.promo.wallet, ['uala']);
  assert.deepStrictEqual(result.promo.issuer_bank, ['uala']);
  assert.strictEqual(result.id, ualaPromoId(fixture.slug));
});

// =============================================================================
// Canonical-id determinism.
// =============================================================================

test('uala-regressions: ualaPromoId is deterministic for a given slug', () => {
  assert.strictEqual(ualaPromoId('carrefour'), ualaPromoId('carrefour'));
});

test('uala-regressions: different slugs produce different ids', () => {
  assert.notStrictEqual(ualaPromoId('carrefour'), ualaPromoId('coderhouse'));
  assert.notStrictEqual(ualaPromoId('coderhouse'), ualaPromoId('sportclub'));
});

test('uala-regressions: ualaPromoId is UUID v5 shape', () => {
  assert.match(
    ualaPromoId('carrefour'),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('uala-regressions: ualaSourceUrl + ualaPromoId are derivable from the same slug', () => {
  const slug = 'sportclub';
  assert.strictEqual(ualaSourceUrl(slug), 'https://www.uala.com.ar/promociones/sportclub');
  // ualaPromoId hashes source_url, so the id is purely a function of the slug.
  const a = ualaPromoId(slug);
  const b = ualaPromoId(slug);
  assert.strictEqual(a, b);
});

// =============================================================================
// Malformed LLM output → throws (per-url has to fail-fast).
// =============================================================================

test('uala-regressions: invalid category in LLM output throws from extractUalaPromo', async () => {
  await assert.rejects(
    () =>
      extractUalaPromo({
        slug: 'carrefour',
        markdown: 'stub',
        llmOverride: async () => ({ data: stubLlm({ category: 'garbage' }) as any, usage: NO_USAGE }),
      }),
    /category|canonical/i,
  );
});

test('uala-regressions: valid_days out-of-range (weekday=7) throws at canonical gate', async () => {
  await assert.rejects(() =>
    extractUalaPromo({
      slug: 'carrefour',
      markdown: 'stub',
      llmOverride: async () => ({ data: stubLlm({ valid_days: [7] }) as any, usage: NO_USAGE }),
    }),
  );
});

test('uala-regressions: bogus tope_period throws at canonical gate', async () => {
  await assert.rejects(() =>
    extractUalaPromo({
      slug: 'x',
      markdown: 'stub',
      llmOverride: async () => ({
        data: stubLlm({ tope: 1000, tope_period: 'eon' }) as any,
        usage: NO_USAGE,
      }),
    }),
  );
});

// =============================================================================
// Edge field-coverage.
// =============================================================================

test('uala-regressions: multi-day legal-text (lunes a viernes) → [1,2,3,4,5]', async () => {
  const result = await extractUalaPromo({
    slug: 'coderhouse',
    markdown: 'stub',
    llmOverride: async () => ({
      data: stubLlm({
        merchant: 'Coderhouse',
        category: 'otro',
        valid_days: [1, 2, 3, 4, 5],
        valid_days_reasoning: 'los días hábiles de lunes a viernes',
      }) as any,
      usage: NO_USAGE,
    }),
  });
  assert.deepStrictEqual(result.promo.valid_days, [1, 2, 3, 4, 5]);
});

test('uala-regressions: Buenos Aires scope → valid_regions=["AR-B"]', async () => {
  const result = await extractUalaPromo({
    slug: 'sportclub',
    markdown: 'stub',
    llmOverride: async () => ({
      data: stubLlm({
        merchant: 'Sportclub',
        category: 'otro',
        valid_regions: ['AR-B'],
        pct: 20,
        tope: 5000,
        tope_period: 'month',
      }) as any,
      usage: NO_USAGE,
    }),
  });
  assert.deepStrictEqual(result.promo.valid_regions, ['AR-B']);
  assert.strictEqual(result.promo.tope, 5000);
  assert.strictEqual(result.promo.tope_period, 'month');
});

test('uala-regressions: tope=null keeps tope_period=null even if LLM returned a string', async () => {
  const result = await extractUalaPromo({
    slug: 'x',
    markdown: 'stub',
    llmOverride: async () => ({
      data: stubLlm({ tope: null, tope_period: '' as any }) as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promo.tope, null);
  assert.strictEqual(result.promo.tope_period, null);
});

test('uala-regressions: cuotas-only merchant (pct=0, promo_type="cuotas") is schema-valid', async () => {
  const result = await extractUalaPromo({
    slug: 'cuotas-merchant',
    markdown: 'stub',
    llmOverride: async () => ({
      data: stubLlm({
        merchant: 'Test Electro',
        category: 'electro',
        pct: 0,
        promo_type: 'cuotas',
        tope: null,
        tope_period: null,
      }) as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promo.pct, 0);
  assert.strictEqual(result.promo.promo_type, 'cuotas');
});

test('uala-regressions: LLM issuer_bank override is respected (stays ["uala"] by default)', async () => {
  // The adapter prefers LLM-provided issuer_bank if non-empty, falls back to ['uala'].
  const result = await extractUalaPromo({
    slug: 'x',
    markdown: 'stub',
    llmOverride: async () => ({
      data: stubLlm({ issuer_bank: [] as any }) as any,
      usage: NO_USAGE,
    }),
  });
  // Empty array → fallback to ['uala'].
  assert.deepStrictEqual(result.promo.issuer_bank, ['uala']);
});

// =============================================================================
// Hub parser.
// =============================================================================

test('uala-hub: parseHubSlugs dedupes repeated links', () => {
  const md = [
    '[Carrefour](https://www.uala.com.ar/promociones/carrefour)',
    '[Carrefour again](https://www.uala.com.ar/promociones/carrefour)',
    '[Coderhouse](https://www.uala.com.ar/promociones/coderhouse)',
  ].join('\n');
  const slugs = parseHubSlugs(md);
  assert.deepStrictEqual(slugs, ['carrefour', 'coderhouse']);
});

test('uala-hub: parseHubSlugs skips IGNORED_SLUGS (uala-mas)', () => {
  const md = [
    '[Promos](https://www.uala.com.ar/promociones/carrefour)',
    '[Loyalty](https://www.uala.com.ar/uala-mas)', // ignored
    '[Promos](https://www.uala.com.ar/promociones/sportclub)',
  ].join('\n');
  const slugs = parseHubSlugs(md);
  assert.ok(slugs.includes('carrefour'));
  assert.ok(slugs.includes('sportclub'));
  assert.ok(!slugs.includes('uala-mas'));
});

test('uala-hub: parseHubSlugs output is sorted (stable order)', () => {
  const md = [
    '[z](https://www.uala.com.ar/promociones/zeta)',
    '[a](https://www.uala.com.ar/promociones/alfa)',
    '[m](https://www.uala.com.ar/promociones/mike)',
  ].join('\n');
  const slugs = parseHubSlugs(md);
  assert.deepStrictEqual(slugs, ['alfa', 'mike', 'zeta']);
});

test('uala-hub: parseHubSlugs handles www-less and http URLs', () => {
  const md = [
    '[w/ www](https://www.uala.com.ar/promociones/foo)',
    '[no www](https://uala.com.ar/promociones/bar)',
    '[http](http://uala.com.ar/promociones/baz)',
  ].join('\n');
  const slugs = parseHubSlugs(md);
  assert.ok(slugs.includes('foo'));
  assert.ok(slugs.includes('bar'));
  assert.ok(slugs.includes('baz'));
});

test('uala-hub: parseHubSlugs lowercases slugs', () => {
  const md = '[x](https://www.uala.com.ar/promociones/Carrefour)';
  const slugs = parseHubSlugs(md);
  assert.deepStrictEqual(slugs, ['carrefour']);
});

test('uala-hub: parseHubSlugs stops at the slug boundary (no path tail)', () => {
  const md = [
    '[x](https://www.uala.com.ar/promociones/carrefour?utm_source=email)',
    '[y](https://www.uala.com.ar/promociones/coderhouse#terminos)',
  ].join('\n');
  const slugs = parseHubSlugs(md);
  assert.ok(slugs.includes('carrefour'));
  assert.ok(slugs.includes('coderhouse'));
  for (const s of slugs) assert.ok(!s.includes('?'));
});

test('uala-hub: parseHubSlugs returns empty when no promociones links present', () => {
  const md = 'just text, no links, or a [stray](https://example.com/promos)';
  const slugs = parseHubSlugs(md);
  assert.deepStrictEqual(slugs, []);
});

// =============================================================================
// Token envelope.
// =============================================================================

test('uala-regressions: carrefour detail markdown is well under the 15k-token envelope', async () => {
  const md = await loadMarkdown('promociones-carrefour');
  const approxTokens = Math.ceil(md.length / 4);
  assert.ok(approxTokens < 15_000, `Carrefour fixture ~${approxTokens} tokens`);
});
