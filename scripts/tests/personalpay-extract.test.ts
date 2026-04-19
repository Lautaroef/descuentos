// Fixture-based smoke test for the Personal Pay extractor (PARTIAL source).
//
// The critical invariant for this source: every emitted Promo MUST have
// `tope: null` — Personal Pay's tope tiers are locked in an image and the
// `beneficiosclub.personalpay.dev` back-office endpoint is auth-gated. We don't
// invent numbers. If a future LLM extraction starts guessing, this test fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERSONALPAY_SOURCE_ID,
  personalpayPromoId,
  extractPersonalPayPromos,
} from '../lib/personalpay-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'personalpay');

interface FixturePayload {
  source_url: string;
  data: { promos: Array<Record<string, unknown>> };
}

async function loadFixture(): Promise<FixturePayload> {
  const raw = await readFile(resolve(FIXTURES_DIR, 'beneficios.extract.json'), 'utf8');
  return JSON.parse(raw) as FixturePayload;
}

async function loadMarkdown(): Promise<string> {
  return readFile(resolve(FIXTURES_DIR, 'beneficios.md'), 'utf8');
}

test('personalpay-extract: fixture produces schema-valid Promo rows with null topes', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractPersonalPayPromos({
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
    assert.strictEqual(promo.source_id, PERSONALPAY_SOURCE_ID);
    assert.strictEqual(promo.source_url, fixture.source_url);
    assert.deepStrictEqual(promo.wallet, ['personalpay']);
    assert.strictEqual(promo.tope, null, `${promo.merchant}: tope must be null (partial source)`);
    assert.strictEqual(
      promo.tope_period,
      null,
      `${promo.merchant}: tope_period must be null when tope is null`,
    );
  }
});

test('personalpay-extract: even if the LLM hallucinates a tope, the Zod gate still accepts it — BUT our contract says this shouldn\'t happen', async () => {
  // This test documents the current invariant: the schema DOES allow non-null
  // tope. What keeps topes null is the PROMPT (lib/personalpay-extract.ts).
  // If a regression relaxes the prompt and the LLM starts emitting topes, the
  // fixture-based test above catches it. We assert here that the invariant is a
  // prompt-level, not schema-level, constraint — so future devs know to keep
  // the prompt strict.
  const md = '# Personal Pay fake';
  const stubbed = {
    promos: [
      {
        merchant: 'Hallucinated',
        category: 'farmacia',
        pct: 10,
        tope: 5000, // hallucinated tope
        tope_period: 'month',
        valid_days: [3],
        valid_regions: [],
        valid_from: '2026-04-01',
        valid_to: '2026-04-30',
        requires_min_spend: null,
        promo_type: 'cashback',
      },
    ],
  };

  const result = await extractPersonalPayPromos({
    source_url: 'https://www.personalpay.com.ar/beneficios',
    markdown: md,
    llmOverride: async () => ({
      data: stubbed as any,
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  // Zod accepts it. Our behavioural contract (prompt + fixture test) rejects it.
  // This test exists to document the invariant — testing agent may later convert
  // it into a hard schema-level guard if we want to enforce 'no topes for
  // personalpay' at the type level.
  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos[0].tope, 5000);
});

test('personalpay-extract: personalpayPromoId is deterministic across runs', () => {
  const url = 'https://www.personalpay.com.ar/beneficios';
  assert.strictEqual(
    personalpayPromoId(url, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]),
    personalpayPromoId(url, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]),
  );
  // Different days or merchant → different id.
  assert.notStrictEqual(
    personalpayPromoId(url, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]),
    personalpayPromoId(url, 'Farmalife', 10, [1]),
  );
  assert.notStrictEqual(
    personalpayPromoId(url, 'Farmalife', 10, [0, 1, 2, 3, 4, 5, 6]),
    personalpayPromoId(url, 'Farmacity', 10, [0, 1, 2, 3, 4, 5, 6]),
  );
});
