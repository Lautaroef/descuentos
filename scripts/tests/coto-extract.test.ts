// Fixture-based smoke test for the Coto cross-bank catalog extractor.
//
// Fixture corpus (scripts/samples/long-tail/super/coto/):
//   - cotodigital-descuentos.md           — Firecrawl markdown of the catalog
//   - cotodigital-descuentos.extract.json — representative LLM-shaped payload
//
// Strategy: stub the Gemini call with the known-good payload, run the full
// `extractCotoPromos()` pipeline (Zod gate + id derivation), and assert a
// schema-valid non-empty Promo[] comes out. Deep coverage is the testing
// agent's job per the Phase 3.3 brief.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COTO_SOURCE_ID,
  extractCotoPromos,
} from '../lib/coto-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'coto');

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

test('coto: fixture produces a non-empty, schema-valid Promo[]', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractCotoPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
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

  // Spot-check the PromoArg-differentiator promo: Comunidad Coto 15% Miércoles sin tope.
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
    usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
  });

  const run1 = await extractCotoPromos({ source_url: fixture.source_url, markdown: md, llmOverride: stub });
  const run2 = await extractCotoPromos({ source_url: fixture.source_url, markdown: md, llmOverride: stub });

  assert.deepStrictEqual(run1.ids, run2.ids, 'ids are stable across re-runs');
  assert.strictEqual(new Set(run1.ids).size, run1.ids.length, 'all ids distinct within one run');
});
