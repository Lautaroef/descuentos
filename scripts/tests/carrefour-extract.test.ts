// Fixture-based smoke test for the Carrefour /descuentos-bancarios extractor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CARREFOUR_SOURCE_ID,
  extractCarrefourPromos,
} from '../lib/carrefour-extract.js';
import { cleanCarrefourMarkdown } from '../ingestion/carrefour-source.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'carrefour');

async function loadFixture() {
  const raw = await readFile(resolve(FIX, 'descuentos-bancarios.extract.json'), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}

async function loadMarkdown() {
  return readFile(resolve(FIX, 'descuentos-bancarios.md'), 'utf8');
}

test('carrefour: fixture produces a non-empty, schema-valid Promo[]', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(
    result.rejected_count,
    0,
    `zero rejects: ${result.rejected_reasons.join('; ')}`,
  );
  assert.ok(result.promos.length > 0);

  for (const p of result.promos) {
    assert.strictEqual(p.source_id, CARREFOUR_SOURCE_ID);
    assert.strictEqual(p.merchant, 'Carrefour');
    assert.strictEqual(p.category, 'supermercado');
  }

  // The PromoArg-differentiator: a single universal cross-wallet promo.
  const universal = result.promos.find((p) => p.wallet.length >= 5);
  assert.ok(universal, '10% universal cross-wallet block emitted as ONE row');
  assert.ok(
    universal!.wallet.includes('cuentadni'),
    'Cuenta DNI is a wallet on the universal promo',
  );
  assert.ok(
    universal!.wallet.includes('personalpay'),
    'Personal Pay is a wallet on the universal promo',
  );
  assert.ok(
    universal!.wallet.includes('bna_plus'),
    'BNA+ is a wallet on the universal promo',
  );
  assert.ok(universal!.wallet.includes('prex'), 'Prex on the universal promo');
  assert.strictEqual(universal!.pct, 10);
  assert.strictEqual(universal!.tope, null, 'universal 10% is sin tope');
});

test('carrefour: cleanCarrefourMarkdown strips embedded VTEX JS blob', () => {
  const junk = 'x'.repeat(8000);
  const md = [
    '## heading',
    '',
    'real content',
    junk,
    'more content',
  ].join('\n');

  const out = cleanCarrefourMarkdown(md);
  assert.ok(!out.includes(junk), 'long line dropped');
  assert.ok(out.includes('real content'), 'short lines preserved');
  assert.ok(out.includes('more content'));
});
