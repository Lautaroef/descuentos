// Brubank — valid_to invariant regression tests.
//
// This file locks in the Phase 3.3 fix for the "valid_to pollution" bug that
// hid all 85 fresh Brubank promos from production on 2026-04-18. The root
// cause: the old prompt instructed "valid_to = last day of the current
// month", so the LLM emitted a hallucinated past date on pages that had no
// actual vigencia. The `valid_to >= today` gate in src/lib/queries.ts then
// correctly hid every row once the month rolled over.
//
// The fix is twofold:
//   1. Prompt-level: instruct the LLM to emit null when the page has no
//      explicit end-date markers.
//   2. Runtime guard (Option B, evidence-based): if the source markdown
//      contains NO end-date markers, force null across the whole payload
//      regardless of what the LLM returned.
//
// These tests enforce the class invariant: fixture-driven + hallucination
// stubs + marker-gated behavior. The full Brubank markdown fixture has NO
// end-date markers, so every emitted row MUST have valid_to=null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRUBANK_SOURCE_URL,
  extractBrubankPromos,
  markdownDeclaresEndDate,
} from '../lib/brubank-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'brubank');
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
    plan: 'ultra',
    merchant: 'Axion',
    category: 'combustible',
    pct: 30,
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

test('brubank valid_to: markdownDeclaresEndDate is false on a catalog with no date markers', async () => {
  const md = await loadMarkdown();
  assert.strictEqual(
    markdownDeclaresEndDate(md),
    false,
    'the real Brubank Webflow fixture has no vigencia markers',
  );
});

test('brubank valid_to: markdownDeclaresEndDate fires on "Vigencia hasta DD/MM/YY"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Promo XYZ — Vigencia hasta 30/04/26'),
    true,
  );
});

test('brubank valid_to: markdownDeclaresEndDate fires on "Válido hasta el 15 de mayo"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('30% reintegro. Válido hasta el 15 de mayo.'),
    true,
  );
});

test('brubank valid_to: markdownDeclaresEndDate fires on "Hasta el 30/04"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Descuento Cabify — Hasta el 30/04'),
    true,
  );
});

test('brubank valid_to: markdownDeclaresEndDate fires on "Vigencia Del DD/MM/YY al DD/MM/YY"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Vigencia Del 01/04/26 al 30/04/26'),
    true,
  );
});

test('brubank valid_to: markdownDeclaresEndDate ignores prose about "ongoing benefits"', () => {
  assert.strictEqual(
    markdownDeclaresEndDate('Conocé los beneficios de tu plan. Ahorrá todos los días.'),
    false,
  );
});

// =============================================================================
// Fixture-level invariant: the real captured markdown → every row is null.
// =============================================================================

test('brubank valid_to: real markdown + hallucinated LLM payload → every row valid_to is null', async () => {
  // The fixture JSON was produced by the OLD prompt and still contains
  // hallucinated "2026-04-30" dates for every promo. The extractor's runtime
  // guard MUST force them all to null because the page has no markers.
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  // Sanity: the fixture genuinely contains dates (not null) pre-guard.
  const rawDates = new Set(fixture.data.promos.map((p) => p.valid_to));
  assert.ok(
    rawDates.size > 0 && !rawDates.has(null),
    'fixture still has hallucinated dates; guard should nullify them',
  );

  const result = await extractBrubankPromos({
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
      `${p.merchant}/${p.issuer_bank?.[0]}: runtime guard must null a hallucinated date on a markerless page`,
    );
  }
});

// =============================================================================
// Hard invariant: aggressive hallucination stubs are still forced to null.
// =============================================================================

test('brubank valid_to: HARD guard — even if the LLM hallucinates a date, the guard nulls it on a markerless page', async () => {
  // Worst case: LLM emits three DIFFERENT invented past dates. All must land
  // as null because the page has no markers.
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# Brubank Beneficios — rolling catalog\n\nCerini 50% todos los días.',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'A', valid_to: '2025-12-31' }),
          stubPromo({ merchant: 'B', valid_to: '2026-04-30' }),
          stubPromo({ merchant: 'C', valid_to: '2026-06-15' }),
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
// Preserves legitimate end-dates when the page declares them.
// =============================================================================

test('brubank valid_to: when the page DOES declare a vigencia, the LLM date is trusted', async () => {
  // Simulate a Brubank markdown with an explicit "Vigencia hasta" marker. The
  // guard should NOT force null here; the LLM's per-row decision is authoritative.
  const mdWithMarker = `
# Promoción especial Cabify
40% de reintegro — Vigencia hasta 31/05/26.
`;
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: mdWithMarker,
    llmOverride: async () => ({
      data: {
        promos: [stubPromo({ merchant: 'Cabify', valid_to: '2026-05-31' })],
      } as any,
      usage: NO_USAGE,
    }),
  });

  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(
    result.promos[0].valid_to,
    '2026-05-31',
    'LLM date preserved when the page has an end-date marker',
  );
});

test('brubank valid_to: page HAS a marker but LLM emits null for THIS card → null is preserved', async () => {
  // Even on a page with markers, the LLM may correctly assign null to a card
  // the marker doesn't cover. Guard must not invent a date.
  const mdWithMarker = 'Promo A — Vigencia hasta 31/05/26.\n\nPromo B — sin fecha.';
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: mdWithMarker,
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'A', valid_to: '2026-05-31' }),
          stubPromo({ merchant: 'B', valid_to: null }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos[0].valid_to, '2026-05-31');
  assert.strictEqual(result.promos[1].valid_to, null);
});

// =============================================================================
// End-to-end: LLM emits null on a markerless page → null passes through.
// =============================================================================

test('brubank valid_to: LLM-emitted null on a markerless page stays null (no coercion)', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# Brubank rolling catalog',
    llmOverride: async () => ({
      data: { promos: [stubPromo({ merchant: 'Axion', valid_to: null })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos[0].valid_to, null);
});

// =============================================================================
// Serving-layer compatibility: null valid_to must pass the Zod gate.
// =============================================================================

test('brubank valid_to: null passes the canonical Promo schema gate (no rejection)', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# no markers',
    llmOverride: async () => ({
      data: {
        promos: [
          stubPromo({ merchant: 'X', valid_to: '2026-04-30' }),
          stubPromo({ merchant: 'Y', valid_to: null }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0, 'null valid_to must be schema-valid');
  assert.strictEqual(result.promos.length, 2);
  for (const p of result.promos) {
    assert.strictEqual(p.valid_to, null);
  }
});
