// Fixture-based smoke test for the Ualá per-url extractor.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'uala');

interface FixturePayload {
  slug: string;
  source_url: string;
  data: Record<string, unknown>;
}

async function loadFixture(name: string): Promise<FixturePayload> {
  const raw = await readFile(resolve(FIXTURES_DIR, `${name}.extract.json`), 'utf8');
  return JSON.parse(raw) as FixturePayload;
}

async function loadMarkdown(name: string): Promise<string> {
  return readFile(resolve(FIXTURES_DIR, `${name}.md`), 'utf8');
}

test('uala-extract: carrefour fixture yields a schema-valid Promo', async () => {
  const fixture = await loadFixture('promociones-carrefour');
  const md = await loadMarkdown('promociones-carrefour');

  const result = await extractUalaPromo({
    slug: fixture.slug,
    markdown: md,
    llmOverride: async () => ({
      data: fixture.data as any,
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.promo.source_id, UALA_SOURCE_ID);
  assert.strictEqual(result.promo.source_url, fixture.source_url);
  assert.deepStrictEqual(result.promo.wallet, ['uala']);
  assert.deepStrictEqual(result.promo.issuer_bank, ['uala']);
  assert.strictEqual(result.promo.merchant, 'Carrefour');
  assert.strictEqual(result.promo.pct, 10);
  assert.strictEqual(result.promo.tope, null);
  assert.strictEqual(result.promo.tope_period, null);
  // Carrefour is Saturday-only in the T&Cs — the LLM must NOT default to all 7.
  assert.deepStrictEqual(result.promo.valid_days, [6]);
  assert.strictEqual(result.id, ualaPromoId(fixture.slug));
});

test('uala-extract: ualaPromoId is deterministic', () => {
  assert.strictEqual(ualaPromoId('carrefour'), ualaPromoId('carrefour'));
  assert.notStrictEqual(ualaPromoId('carrefour'), ualaPromoId('coderhouse'));
  assert.match(
    ualaPromoId('carrefour'),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('uala-extract: ualaSourceUrl + slug round-trip', () => {
  assert.strictEqual(ualaSourceUrl('carrefour'), 'https://www.uala.com.ar/promociones/carrefour');
});

test('uala-hub: parseHubSlugs extracts merchant slugs from hub markdown', () => {
  const md = [
    '[**10% Off** — Carrefour](https://www.uala.com.ar/promociones/carrefour)',
    '[**20% descuento** — Coderhouse](https://www.uala.com.ar/promociones/coderhouse)',
    '[**20% descuento** — Sportclub](https://www.uala.com.ar/promociones/sportclub)',
    '[**35% reintegro** — Ualá Bis](https://www.uala.com.ar/promociones/ualabis)',
    '[**Puntos** — Ualá+](https://www.uala.com.ar/uala-mas)', // ignored slug path
  ].join('\n');
  const slugs = parseHubSlugs(md);
  assert.deepStrictEqual(slugs, ['carrefour', 'coderhouse', 'sportclub', 'ualabis']);
});
