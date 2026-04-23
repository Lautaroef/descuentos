// Personal Pay — valid_to invariant regression tests.
//
// Mirrors the Brubank invariant suite. Personal Pay's /beneficios hub is a
// rolling Nivel-tier catalog; the page has no per-card vigencia. The old
// prompt told the LLM to emit "last day of current month", which got hidden
// by the serving-layer `valid_to >= today` gate once the scraping month
// rolled over — same bug class as Brubank, same fix.
//
// The fix is the same:
//   1. Prompt: null by default; emit a date only if markers are present.
//   2. Runtime guard (Option B): if markdown has no end-date markers, force
//      null across the whole payload regardless of LLM output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERSONALPAY_SOURCE_URL,
  extractPersonalPayPromos,
  markdownDeclaresEndDate,
} from '../lib/personalpay-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'personalpay');
const NO_USAGE = { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };

async function loadFixture() {
  const raw = await readFile(resolve(FIXTURES_DIR, 'beneficios.extract.json'), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}

async function loadMarkdown() {
  return readFile(resolve(FIXTURES_DIR, 'beneficios.md'), 'utf8');
}

function stubPromo(overrides: Record<string, unknown>) {
  return {
    merchant: 'Farmalife',
    category: 'farmacia',
    pct: 10,
    tope: null,
    tope_period: null,
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    promo_type: 'cashback',
    ...overrides,
  };
}

// =============================================================================
// markdownDeclaresEndDate — pure-regex unit tests.
// =============================================================================

test('personalpay valid_to: markdownDeclaresEndDate is false on the real hub fixture (no markers)', async () => {
  const md = await loadMarkdown();
  assert.strictEqual(markdownDeclaresEndDate(md), false);
});

test('personalpay valid_to: markdownDeclaresEndDate fires on "Vigencia hasta"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Promo de temporada — Vigencia hasta 15/05/26.'),
    true,
  );
});

test('personalpay valid_to: markdownDeclaresEndDate fires on "Válido hasta el DD de <mes>"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Válido hasta el 31 de mayo'),
    true,
  );
});

test('personalpay valid_to: markdownDeclaresEndDate fires on "Vigencia Del DD/MM/YY al DD/MM/YY"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Vigencia Del 01/05/26 al 31/05/26'),
    true,
  );
});

// =============================================================================
// Fixture-level invariant: the real captured markdown → every row is null.
// =============================================================================

test('personalpay valid_to: real markdown + hallucinated fixture dates → guard forces null on every row', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  // Sanity: fixture still has hallucinated dates pre-guard.
  const rawDates = new Set(fixture.data.promos.map((p) => p.valid_to));
  assert.ok(rawDates.size > 0 && !rawDates.has(null));

  const result = await extractPersonalPayPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });

  assert.strictEqual(result.rejected_count, 0);
  assert.ok(result.promos.length >= 1);
  for (const p of result.promos) {
    assert.strictEqual(
      p.valid_to,
      null,
      `${p.merchant}: runtime guard must null a hallucinated date on a markerless page`,
    );
  }
});

// =============================================================================
// Hard invariant: aggressive hallucination stubs still land as null.
// =============================================================================

test('personalpay valid_to: HARD guard — LLM hallucinates multiple past dates → all forced to null', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: '# Personal Pay hub — no markers',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'A', valid_to: '2025-11-30' }),
          stubPromo({ merchant: 'B', valid_to: '2026-04-30', pct: 20 }),
          stubPromo({ merchant: 'C', valid_to: '2026-07-01', pct: 15 }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos.length, 3);
  for (const p of result.promos) {
    assert.strictEqual(p.valid_to, null, `${p.merchant}: guard forced null`);
  }
});

// =============================================================================
// Preserves legitimate dates when the page declares them.
// =============================================================================

test('personalpay valid_to: when the page DOES declare a vigencia, the LLM date is preserved', async () => {
  const mdWithMarker = 'Promo Lázaro especial — Vigencia hasta 31/05/26.';
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: mdWithMarker,
    llmOverride: async () => ({
      data: { promos: [stubPromo({ merchant: 'Lázaro', valid_to: '2026-05-31' })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos[0].valid_to, '2026-05-31');
});

test('personalpay valid_to: page has a marker but LLM says null for this card → null preserved', async () => {
  const md = 'Promo A — Vigencia hasta 30/06/26.\nPromo B — sin fecha.';
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: md,
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'A', valid_to: '2026-06-30' }),
          stubPromo({ merchant: 'B', valid_to: null, pct: 15 }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos[0].valid_to, '2026-06-30');
  assert.strictEqual(result.promos[1].valid_to, null);
});

// =============================================================================
// End-to-end: LLM-emitted null on a markerless page passes through.
// =============================================================================

test('personalpay valid_to: LLM null on a markerless page stays null (no coercion)', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: '# Personal Pay hub — rolling',
    llmOverride: async () => ({
      data: { promos: [stubPromo({ merchant: 'Farmalife', valid_to: null })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos[0].valid_to, null);
});

// =============================================================================
// Schema compatibility.
// =============================================================================

test('personalpay valid_to: null passes the canonical Promo schema gate', async () => {
  const result = await extractPersonalPayPromos({
    source_url: PERSONALPAY_SOURCE_URL,
    markdown: '# no markers',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'X', valid_to: '2026-04-30' }),
          stubPromo({ merchant: 'Y', valid_to: null, pct: 15 }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos.length, 2);
  for (const p of result.promos) {
    assert.strictEqual(p.valid_to, null);
  }
});
