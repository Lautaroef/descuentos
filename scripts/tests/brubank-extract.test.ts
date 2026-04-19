// Fixture-based smoke test for the Brubank extractor.
//
// Stubs the Gemini call with a known-good LLM payload (see
// scripts/samples/long-tail/wallets/brubank/beneficios.extract.json), runs through
// the canonical Zod gate, and asserts the promos come out schema-valid with the
// expected plan-tier encoding.
//
// Per Phase 3.2 guidance this is a MINIMUM viable test — the Phase 3.3 testing
// agent will add depth (edge cases, malformed payloads, multi-rate cards, etc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRUBANK_SOURCE_ID,
  brubankPromoId,
  extractBrubankPromos,
} from '../lib/brubank-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'brubank');

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

test('brubank-extract: fixture produces schema-valid Promo rows with plan-tier issuer_bank', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractBrubankPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0, 'zero rejected');
  assert.strictEqual(result.promos.length, fixture.data.promos.length);
  assert.strictEqual(result.ids.length, result.promos.length);

  for (const promo of result.promos) {
    assert.strictEqual(promo.source_id, BRUBANK_SOURCE_ID);
    assert.strictEqual(promo.source_url, fixture.source_url);
    assert.deepStrictEqual(promo.wallet, ['brubank']);
    assert.ok(Array.isArray(promo.issuer_bank) && promo.issuer_bank.length === 1);
    const tier = promo.issuer_bank![0];
    assert.ok(
      tier === 'brubank-ultra' || tier === 'brubank-plus' || tier === 'brubank-one',
      `plan tier encoded in issuer_bank: ${tier}`,
    );
  }

  // Spot-check a known row: Plan Ultra Axion 30% tope $6.000.
  const ultraAxion = result.promos.find(
    (p) => p.merchant === 'Axion Energy' && p.issuer_bank?.[0] === 'brubank-ultra',
  );
  assert.ok(ultraAxion, 'Ultra Axion present');
  assert.strictEqual(ultraAxion!.pct, 30);
  assert.strictEqual(ultraAxion!.tope, 6000);
  assert.strictEqual(ultraAxion!.tope_period, 'month');

  // Plan One Axion 10% on martes only.
  const oneAxion = result.promos.find(
    (p) => p.merchant === 'Axion Energy' && p.issuer_bank?.[0] === 'brubank-one',
  );
  assert.ok(oneAxion);
  assert.deepStrictEqual(oneAxion!.valid_days, [2]);
  assert.strictEqual(oneAxion!.tope, null);
});

test('brubank-extract: the SAME merchant under different plans produces different ids', () => {
  const url = 'https://brubank.com/beneficios';
  const ultra = brubankPromoId(url, 'ultra', 'Axion Energy', 30, [0, 1, 2, 3, 4, 5, 6]);
  const plus = brubankPromoId(url, 'plus', 'Axion Energy', 20, [0, 5, 6]);
  const one = brubankPromoId(url, 'one', 'Axion Energy', 10, [2]);
  assert.notStrictEqual(ultra, plus);
  assert.notStrictEqual(plus, one);
  assert.notStrictEqual(ultra, one);
  // v5 shape.
  assert.match(ultra, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('brubank-extract: plan="all" fans out into three rows (ultra/plus/one)', async () => {
  const md = '# Brubank fake';
  const stubbed = {
    promos: [
      {
        plan: 'all',
        merchant: 'Nike',
        category: 'indumentaria',
        pct: 0,
        tope: null,
        tope_period: null,
        valid_days: [0, 1, 2, 3, 4, 5, 6],
        valid_regions: [],
        valid_from: '2026-04-01',
        valid_to: '2026-04-30',
        requires_min_spend: null,
        promo_type: 'cuotas',
        cuotas: 6,
      },
    ],
  };

  const result = await extractBrubankPromos({
    source_url: 'https://brubank.com/beneficios',
    markdown: md,
    llmOverride: async () => ({
      data: stubbed as any,
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos.length, 3, 'one row per plan tier');
  const tiers = new Set(result.promos.map((p) => p.issuer_bank?.[0]));
  assert.deepStrictEqual(
    [...tiers].sort(),
    ['brubank-one', 'brubank-plus', 'brubank-ultra'],
  );
  assert.strictEqual(new Set(result.ids).size, 3, 'three distinct ids');
});
