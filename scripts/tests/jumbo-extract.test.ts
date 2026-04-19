// Fixture-based smoke test for the Jumbo cross-bank catalog + Jumbo al 100 extractor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JUMBO_SOURCE_ID, extractJumboPromos } from '../lib/jumbo-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'jumbo');

async function loadPair(slug: string) {
  const md = await readFile(resolve(FIX, `${slug}.md`), 'utf8');
  const raw = await readFile(resolve(FIX, `${slug}.extract.json`), 'utf8');
  const fixture = JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
  return { fixture, md };
}

test('jumbo: /descuentos-del-dia fixture produces schema-valid Promo[]', async () => {
  const { fixture, md } = await loadPair('descuentos-del-dia');

  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0, `no rejects: ${result.rejected_reasons.join('; ')}`);
  assert.ok(result.promos.length > 0, 'at least one promo');

  for (const p of result.promos) {
    assert.strictEqual(p.source_id, JUMBO_SOURCE_ID);
    assert.strictEqual(p.merchant, 'Jumbo');
    assert.strictEqual(p.category, 'supermercado');
  }

  // Spot-check the sort-by-tope wedge: Patagonia Sábados 35% tope $25k.
  const patagonia35 = result.promos.find(
    (p) => p.pct === 35 && p.issuer_bank?.includes('patagonia'),
  );
  assert.ok(patagonia35, 'Patagonia 35% Sábados present');
  assert.strictEqual(patagonia35!.tope, 25000);
  assert.strictEqual(patagonia35!.tope_period, 'month');
});

test('jumbo: /jumbo-al-cien fixture emits a single pesoscheck promo', async () => {
  const { fixture, md } = await loadPair('jumbo-al-cien');

  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos.length, 1);

  const p = result.promos[0];
  assert.strictEqual(p.pct, 100, 'Jumbo al 100 headline');
  assert.deepStrictEqual(p.wallet, ['jumbo_mas']);
  assert.strictEqual(p.tope, null, 'no numeric tope on pesoscheck');
});

test('jumbo: kind is "bulk" and both default URLs list', async () => {
  const { createJumboSource, JUMBO_DEFAULT_URLS } = await import('../ingestion/jumbo-source.js');
  const src = createJumboSource();
  assert.strictEqual(src.kind, 'bulk');
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, [...JUMBO_DEFAULT_URLS]);
});
