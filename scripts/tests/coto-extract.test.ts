// Fixture-based tests for the Coto cross-bank catalog extractor.
//
// Layered depth:
//   1. Smoke: fixture produces schema-valid Promo[] with Comunidad Coto row.
//   2. Schema conformance: every row passes the canonical Zod `Promo` schema.
//   3. Source-specific invariants: merchant, category, wallet enum, regional
//      bank fan-out, Naranja X Plan Turbo split.
//   4. Canonical id determinism (same → same, different → different).
//   5. Intra-page dedup.
//   6. Rejection path: one malformed row rejects, others pass.
//   7. Source adapter shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COTO_SOURCE_ID,
  extractCotoPromos,
} from '../lib/coto-extract.js';
import { Promo as PromoSchema } from '../promo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'coto');

const COTO_URLS = [
  'https://www.coto.com.ar/descuentos/',
  'https://www.cotodigital.com.ar/sitios/cdigi/descuentos',
];

async function loadFixture() {
  const raw = await readFile(resolve(FIX, 'cotodigital-descuentos.extract.json'), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}

async function loadMarkdown() {
  return readFile(resolve(FIX, 'cotodigital-descuentos.md'), 'utf8');
}

function usage() {
  return { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };
}

// =============================================================================
// 1. Smoke — the legacy tests preserved
// =============================================================================

test('coto: fixture produces a non-empty, schema-valid Promo[]', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: usage(),
    }),
  });

  assert.strictEqual(result.rejected_count, 0, `zero rejects: ${result.rejected_reasons.join('; ')}`);
  assert.ok(result.promos.length > 0, 'at least one promo');
  assert.strictEqual(result.promos.length, result.ids.length, 'ids length matches');

  for (const p of result.promos) {
    assert.strictEqual(p.source_id, COTO_SOURCE_ID);
    assert.strictEqual(p.source_url, fixture.source_url);
    assert.strictEqual(p.merchant, 'Coto');
    assert.strictEqual(p.category, 'supermercado');
  }

  const comunidad = result.promos.find((p) => p.wallet.includes('comunidad_coto'));
  assert.ok(comunidad, 'Comunidad Coto own-cupon present');
  assert.strictEqual(comunidad!.pct, 15);
  assert.strictEqual(comunidad!.tope, null);
  assert.deepStrictEqual(comunidad!.valid_days, [3]);
});

test('coto: deterministic ids across repeated runs', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const stub = async () => ({
    data: { promos: fixture.data.promos as any },
    usage: usage(),
  });

  const run1 = await extractCotoPromos({ source_url: fixture.source_url, markdown: md, llmOverride: stub });
  const run2 = await extractCotoPromos({ source_url: fixture.source_url, markdown: md, llmOverride: stub });

  assert.deepStrictEqual(run1.ids, run2.ids, 'ids are stable across re-runs');
  assert.strictEqual(new Set(run1.ids).size, run1.ids.length, 'all ids distinct within one run');
});

// =============================================================================
// 2. Schema conformance
// =============================================================================

test('coto: every extracted promo passes the canonical Promo Zod schema', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  assert.strictEqual(result.rejected_count, 0);
  for (const promo of result.promos) {
    const parsed = PromoSchema.safeParse(promo);
    assert.ok(parsed.success, `promo validates: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

// =============================================================================
// 3. Source-specific invariants
// =============================================================================

test('coto: Comunidad Coto own-cupon has wallet=["comunidad_coto"], empty issuer_bank', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const cc = result.promos.find((p) => p.wallet.includes('comunidad_coto'));
  assert.ok(cc);
  assert.deepStrictEqual(cc!.wallet, ['comunidad_coto'], 'exactly the own-cupon wallet');
  // Empty / undefined issuer_bank — own-cupon has no participating bank.
  assert.ok(
    !cc!.issuer_bank || cc!.issuer_bank.length === 0,
    'Comunidad Coto has no issuer_bank',
  );
});

test('coto: Naranja X Martes splits into Plan Turbo + non-Plan Turbo (TWO distinct rows)', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const martesNaranjax = result.promos.filter(
    (p) =>
      p.valid_days.length === 1 &&
      p.valid_days[0] === 2 &&
      p.issuer_bank?.includes('naranjax'),
  );
  assert.strictEqual(martesNaranjax.length, 2, 'Plan Turbo + non-Plan Turbo');
  const pcts = martesNaranjax.map((p) => p.pct).sort((a, b) => a - b);
  assert.deepStrictEqual(pcts, [10, 25], 'pct=10 (3k tope) and pct=25 (12k tope) rows');
  // Their ids must differ.
  const ids = result.promos
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) =>
        p.valid_days.length === 1 &&
        p.valid_days[0] === 2 &&
        p.issuer_bank?.includes('naranjax'),
    )
    .map(({ i }) => result.ids[i]);
  assert.strictEqual(new Set(ids).size, 2, 'distinct ids for the two tiers');
});

test('coto: regional-bank "sin tope" rows are fanned out (santacruz standalone row)', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const scRow = result.promos.find((p) => p.issuer_bank?.includes('santacruz'));
  assert.ok(scRow, 'Santa Cruz regional-bank row present');
  assert.strictEqual(scRow!.pct, 30);
  assert.strictEqual(scRow!.tope, null, 'sin tope → null');
  assert.deepStrictEqual(scRow!.valid_days, [1]);
});

test('coto: Credicoop cartera-general vs Plan-sueldo are two distinct rows (same day)', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const credicoop = result.promos.filter((p) => p.issuer_bank?.includes('credicoop'));
  assert.strictEqual(credicoop.length, 2, 'two tiers');
  const pcts = credicoop.map((p) => p.pct).sort((a, b) => a - b);
  assert.deepStrictEqual(pcts, [30, 40]);
});

test('coto: wallet field always contains valid enum values (Zod-enforced)', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const allowed = new Set([
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
    'comunidad_coto',
    'jumbo_mas',
    'mi_carrefour',
  ]);
  for (const p of result.promos) {
    for (const w of p.wallet) {
      assert.ok(allowed.has(w), `wallet ${w} in canonical enum`);
    }
  }
});

// =============================================================================
// 4. Source adapter shape
// =============================================================================

test('coto: source kind is "bulk" and listUrls returns the two default URLs', async () => {
  const { createCotoSource, COTO_DEFAULT_URLS } = await import('../ingestion/coto-source.js');
  const src = createCotoSource();
  assert.strictEqual(src.kind, 'bulk');
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, [...COTO_DEFAULT_URLS]);
  for (const u of urls) {
    assert.ok(COTO_URLS.includes(u), `known Coto endpoint: ${u}`);
  }
});

test('coto: source adapter respects urlOverride', async () => {
  const { createCotoSource } = await import('../ingestion/coto-source.js');
  const custom = ['https://www.coto.com.ar/descuentos/'];
  const src = createCotoSource({ urlOverride: custom });
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, custom);
});

// =============================================================================
// 5. Intra-page dedup
// =============================================================================

test('coto: duplicated-tuple rows collapse to one (intra-page dedup)', async () => {
  const fixture = await loadFixture();
  const base = fixture.data.promos[0] as any;
  const duplicate = { ...base, notes: 'cosmetic diff' };
  const payload = [...fixture.data.promos, duplicate];

  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload as any }, usage: usage() }),
  });

  assert.strictEqual(result.promos.length, fixture.data.promos.length);
});

// =============================================================================
// 6. Rejection path
// =============================================================================

test('coto: injecting one invalid category rejects only that row', async () => {
  const fixture = await loadFixture();
  const bad = { ...(fixture.data.promos[0] as any), category: 'food', day_phrase: '(bad row)' };
  const payload = [...fixture.data.promos, bad];

  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload as any }, usage: usage() }),
  });

  assert.strictEqual(result.promos.length, fixture.data.promos.length);
  assert.strictEqual(result.rejected_count, 1);
});

test('coto: injecting invalid valid_from date rejects the row', async () => {
  const fixture = await loadFixture();
  const bad = { ...(fixture.data.promos[0] as any), valid_from: 'not-a-date' };
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: [bad] as any }, usage: usage() }),
  });
  assert.strictEqual(result.promos.length, 0);
  assert.strictEqual(result.rejected_count, 1);
});

// =============================================================================
// 7. Empty payload resilience
// =============================================================================

test('coto: empty LLM payload returns zero promos, no throw', async () => {
  const result = await extractCotoPromos({
    source_url: COTO_URLS[1],
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: [] }, usage: usage() }),
  });
  assert.strictEqual(result.promos.length, 0);
  assert.strictEqual(result.ids.length, 0);
});

// =============================================================================
// 8. Comafi multi-tier tope — lower tope chosen, tier surfaced in notes
// =============================================================================

test('coto: Comafi Jueves tope is the LOWER cartera-general value (13000)', async () => {
  const fixture = await loadFixture();
  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const comafi = result.promos.find((p) => p.issuer_bank?.includes('comafi'));
  assert.ok(comafi);
  assert.strictEqual(comafi!.tope, 13000, 'most-conservative tope wins');
  assert.strictEqual(comafi!.tope_period, 'ticket');
});
