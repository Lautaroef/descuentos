// Fixture-based smoke test for the Naranja X extractor.
//
// Stubs Gemini with a known-good payload and asserts the core wedge promo
// (Martes Supermercados 25% tope $12.000/semana) comes through schema-valid.
// Minimum viable per Phase 3.2; testing agent adds depth.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'naranjax');

interface FixturePayload {
  source_url: string;
  data: { promos: Array<Record<string, unknown>> };
}

async function loadFixture(name: string): Promise<FixturePayload> {
  const raw = await readFile(resolve(FIXTURES_DIR, `${name}.extract.json`), 'utf8');
  return JSON.parse(raw) as FixturePayload;
}

async function loadMarkdown(name: string): Promise<string> {
  return readFile(resolve(FIXTURES_DIR, `${name}.md`), 'utf8');
}

test('naranjax-extract: hub fixture produces schema-valid Promo rows', async () => {
  const fixture = await loadFixture('promociones-hub');
  const md = await loadMarkdown('promociones-hub');

  const result = await extractNaranjaxPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0, 'zero rejected');
  assert.strictEqual(result.promos.length, fixture.data.promos.length);

  for (const promo of result.promos) {
    assert.strictEqual(promo.source_id, NARANJAX_SOURCE_ID);
    assert.strictEqual(promo.source_url, fixture.source_url);
    assert.deepStrictEqual(promo.wallet, ['naranjax']);
    assert.deepStrictEqual(promo.issuer_bank, ['naranjax']);
  }

  // Core wedge promo: Martes supermercados 25% tope $12.000 semanal.
  const superMartes = result.promos.find((p) => p.merchant === 'Supermercados');
  assert.ok(superMartes, 'Supermercados Martes promo present');
  assert.strictEqual(superMartes!.pct, 25);
  assert.strictEqual(superMartes!.tope, 12000);
  assert.strictEqual(superMartes!.tope_period, 'week');
  assert.deepStrictEqual(superMartes!.valid_days, [2]);
});

test('naranjax-extract: naranjaxPromoId is deterministic given (url, merchant, pct, days)', () => {
  const url = 'https://www.naranjax.com/promociones';
  const a = naranjaxPromoId(url, 'Supermercados', 25, [2]);
  const b = naranjaxPromoId(url, 'Supermercados', 25, [2]);
  assert.strictEqual(a, b);
  // Day-set reordering must yield the same id.
  assert.strictEqual(
    naranjaxPromoId(url, 'X', 10, [2, 4]),
    naranjaxPromoId(url, 'X', 10, [4, 2]),
  );
  // pct or merchant delta → different id.
  assert.notStrictEqual(a, naranjaxPromoId(url, 'Supermercados', 20, [2]));
  assert.notStrictEqual(a, naranjaxPromoId(url, 'Carrefour', 25, [2]));
  // v5 shape.
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('naranjax-extract: the SAME promo on two different hub URLs yields two distinct ids (different provenance)', () => {
  const hub = 'https://www.naranjax.com/promociones';
  const hubSuper = 'https://www.naranjax.com/promociones/SUPERMERCADOS_categoria';
  assert.notStrictEqual(
    naranjaxPromoId(hub, 'Supermercados', 25, [2]),
    naranjaxPromoId(hubSuper, 'Supermercados', 25, [2]),
  );
});
