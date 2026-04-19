// Fixture-based tests for the Cuenta DNI press-article extractor.
//
// The fixture corpus in scripts/samples/cuentadni-press-extraction/ contains:
//   - ambito-abril-2026.md            — Firecrawl markdown of the Ámbito article.
//   - ambito-abril-2026.extract.json  — known-good LLM output (9 promos first try).
//   - infobae-abril-2026.md           — Infobae triangulation article.
//
// Strategy: stub the Gemini call with the known-good output, run through the full
// `extractCuentaDniPromos()` pipeline (Zod gate + id derivation), and assert the
// canonical Promo rows come out clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CUENTADNI_SOURCE_ID,
  cuentaDniPromoId,
  extractCuentaDniPromos,
} from '../lib/cuentadni-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'cuentadni-press-extraction');

interface FixturePayload {
  source_url: string;
  data: {
    promos: Array<Record<string, unknown>>;
  };
}

async function loadAmbitoFixture(): Promise<FixturePayload> {
  const raw = await readFile(resolve(FIXTURES_DIR, 'ambito-abril-2026.extract.json'), 'utf8');
  return JSON.parse(raw) as FixturePayload;
}

async function loadAmbitoMarkdown(): Promise<string> {
  return readFile(resolve(FIXTURES_DIR, 'ambito-abril-2026.md'), 'utf8');
}

// =============================================================================
// End-to-end: full Ámbito fixture produces 9 canonical-schema-valid Promos.
// =============================================================================

test('cuenta-dni: Ámbito April 2026 fixture produces 9 schema-valid Promos', async () => {
  const fixture = await loadAmbitoFixture();
  const md = await loadAmbitoMarkdown();

  const result = await extractCuentaDniPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0, 'zero rejected (all 9 validate)');
  assert.strictEqual(result.promos.length, 9, 'nine promos extracted');
  assert.strictEqual(result.ids.length, 9);

  for (const promo of result.promos) {
    assert.strictEqual(promo.source_id, CUENTADNI_SOURCE_ID);
    assert.strictEqual(promo.source_url, fixture.source_url);
    assert.deepStrictEqual(promo.wallet, ['cuentadni']);
    assert.deepStrictEqual(promo.issuer_bank, ['provincia'], 'issuer_bank defaulted to provincia');
    assert.match(
      promo.last_seen_at,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      'last_seen_at is ISO datetime',
    );
    // Region for all Cuenta DNI promos is AR-B.
    assert.deepStrictEqual(promo.valid_regions, ['AR-B']);
  }

  // Spot-check two concrete promos.
  const ferias = result.promos.find((p) => p.merchant.startsWith('Ferias'));
  assert.ok(ferias, 'Ferias y mercados promo present');
  assert.strictEqual(ferias!.pct, 40);
  assert.strictEqual(ferias!.tope, 6000);
  assert.strictEqual(ferias!.tope_period, 'week');
  assert.deepStrictEqual(ferias!.valid_days, [0, 1, 2, 3, 4, 5, 6]);

  const librerias = result.promos.find((p) => p.merchant === 'Librerías');
  assert.ok(librerias, 'Librerías promo present');
  assert.strictEqual(librerias!.tope, null, 'sin tope librerías');
  assert.strictEqual(librerias!.tope_period, null, 'null tope_period paired with null tope');
  assert.strictEqual(librerias!.pct, 10);
});

// =============================================================================
// promo_type derivation: pct=0 → 'cuotas', otherwise 'cashback'.
// =============================================================================

test('cuenta-dni: derives promo_type from pct (all fixture promos are cashback)', async () => {
  const fixture = await loadAmbitoFixture();
  const md = await loadAmbitoMarkdown();

  const result = await extractCuentaDniPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  for (const p of result.promos) {
    assert.strictEqual(p.promo_type, 'cashback', `${p.merchant} promo_type`);
  }
});

// =============================================================================
// Idempotency: deterministic ids mean re-extracting the same article yields the
// same ids — not fresh random UUIDs that would create 2N rows on upsert.
// =============================================================================

test('cuenta-dni: cuentaDniPromoId is deterministic given (source_url, merchant, pct)', () => {
  const url = 'https://example.com/article-a';
  const a = cuentaDniPromoId(url, 'Gastronomía', 25);
  const b = cuentaDniPromoId(url, 'Gastronomía', 25);
  assert.strictEqual(a, b, 'same input → same id');
  // Valid v5 UUID shape.
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  // Different pct → different id (distinguishes promos within the same article).
  assert.notStrictEqual(a, cuentaDniPromoId(url, 'Gastronomía', 20));
  // Different merchant → different id.
  assert.notStrictEqual(a, cuentaDniPromoId(url, 'Farmacia', 25));
  // Different source_url (i.e. a new monthly article) → different id.
  // This is the intentional Phase 3 trade-off: monthly article rotation inserts
  // fresh rows; Phase 4 dedup will collapse content-equivalent promos across
  // months. See cuentadni-extract.ts header for the full rationale.
  assert.notStrictEqual(a, cuentaDniPromoId('https://example.com/article-b', 'Gastronomía', 25));
});

test('cuenta-dni: running the pipeline twice produces the SAME 9 ids (not 18)', async () => {
  const fixture = await loadAmbitoFixture();
  const md = await loadAmbitoMarkdown();
  const stub = async () => ({
    data: { promos: fixture.data.promos as any },
    usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
  });

  const run1 = await extractCuentaDniPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: stub,
  });
  const run2 = await extractCuentaDniPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: stub,
  });

  assert.deepStrictEqual(run1.ids, run2.ids, 'ids are deterministic across runs');
  assert.strictEqual(new Set(run1.ids).size, 9, 'all 9 ids are distinct');
});

// =============================================================================
// Schema-gate rejection: a malformed promo from the LLM must NOT reach upsert.
// =============================================================================

test('cuenta-dni: malformed promos are REJECTED (not silently upserted as garbage)', async () => {
  const fixture = await loadAmbitoFixture();
  const md = await loadAmbitoMarkdown();

  // Inject one deliberately broken promo into the LLM payload: invalid category.
  const goodPromos = fixture.data.promos.slice(0, 3);
  const broken = {
    ...(goodPromos[0] as any),
    merchant: 'Broken Promo',
    category: 'not-a-real-category',
  };
  const mixed = [...goodPromos, broken];

  const result = await extractCuentaDniPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: mixed as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 3, 'only valid promos returned');
  assert.strictEqual(result.ids.length, 3);
  assert.match(result.rejected_reasons[0], /Broken Promo/);
  // The rejected promo's merchant must NOT appear in the accepted list.
  assert.ok(!result.promos.some((p) => p.merchant === 'Broken Promo'));
});

// =============================================================================
// tope_period normalization: LLM-emitted empty-string → null.
// =============================================================================

test('cuenta-dni: empty-string tope_period normalized to null (MODO Sin-tope quirk)', async () => {
  const fixture = await loadAmbitoFixture();
  const md = await loadAmbitoMarkdown();

  // Force one promo to emit tope_period="" with tope=null, mimicking the quirk.
  const modifiedPromos = (fixture.data.promos as any[]).map((p, i) => {
    if (i === 0) return { ...p, tope: null, tope_period: '' };
    return p;
  });

  const result = await extractCuentaDniPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: modifiedPromos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos[0].tope_period, null, 'empty string normalized to null');
});
