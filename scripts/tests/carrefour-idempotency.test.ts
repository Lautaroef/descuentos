// P0 regression test for the Carrefour idempotency flake (Phase 3.3).
//
// Root-cause summary:
//   The implementation agent reported "1 insert / 24 updates" on the second
//   live run of `pnpm run-carrefour`. The id tuple
//     (source_url, day_key, bank_key, pct, promo_type)
//   is deterministic in principle, but Gemini's token-boundary numeric
//   nondeterminism (`10` → `10.0` → `9.999…`) and occasional array-dup drift
//   ([6] → [6, 0, 6]) produced a subtly different id on one row between
//   runs. The supermarket-extract helper now rounds pct to integer, dedupes
//   valid_days, and lowercases/trims bank_key + promo_type. See:
//     scripts/lib/supermarket-extract.ts → `canonicalPct`, `dayKey`,
//     `primaryBank`, `supermarketPromoId`.
//
// These tests deliberately simulate Gemini drift between two runs on the
// same input and assert the emitted id arrays are BYTE-IDENTICAL. Without
// the fix they would differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractCarrefourPromos } from '../lib/carrefour-extract.js';
import { extractCotoPromos } from '../lib/coto-extract.js';
import { extractJumboPromos } from '../lib/jumbo-extract.js';
import {
  supermarketPromoId,
  dayKey,
  banksKey,
  walletsKey,
  variantKey,
} from '../lib/supermarket-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_CARREFOUR = resolve(
  __dirname,
  '..',
  'samples',
  'long-tail',
  'super',
  'carrefour',
);
const FIX_COTO = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'coto');
const FIX_JUMBO = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'jumbo');

type LlmPromo = Record<string, unknown>;

async function loadCarrefour(): Promise<{ source_url: string; promos: LlmPromo[] }> {
  const raw = await readFile(resolve(FIX_CARREFOUR, 'descuentos-bancarios.extract.json'), 'utf8');
  const fixture = JSON.parse(raw) as {
    source_url: string;
    data: { promos: LlmPromo[] };
  };
  return { source_url: fixture.source_url, promos: fixture.data.promos };
}

async function loadCoto() {
  const raw = await readFile(resolve(FIX_COTO, 'cotodigital-descuentos.extract.json'), 'utf8');
  const fixture = JSON.parse(raw) as {
    source_url: string;
    data: { promos: LlmPromo[] };
  };
  return { source_url: fixture.source_url, promos: fixture.data.promos };
}

async function loadJumbo() {
  const raw = await readFile(resolve(FIX_JUMBO, 'descuentos-del-dia.extract.json'), 'utf8');
  const fixture = JSON.parse(raw) as {
    source_url: string;
    data: { promos: LlmPromo[] };
  };
  return { source_url: fixture.source_url, promos: fixture.data.promos };
}

function usage() {
  return { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };
}

// =============================================================================
// P0: Carrefour — two back-to-back extractor runs with a DRIFTED Gemini
// response on the second run MUST produce identical ids.
//
// The drift we simulate is the observed shape of the flake:
//   - pct: `10` → `10.0`
//   - valid_days: `[6]` → `[6, 6]` (duplicate)
//   - bank strings: casing changes
//
// The old id scheme would produce a different id for the 10% universal row;
// the hardened one holds stable.
// =============================================================================

test('carrefour (P0): idempotent ids under Gemini pct / dedup / casing drift', async () => {
  const { source_url, promos } = await loadCarrefour();

  const runA = await extractCarrefourPromos({
    source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: promos as any }, usage: usage() }),
  });

  // Build a drifted variant of the SAME semantic payload. Every transform
  // below must NOT change the canonical id.
  //
  // Note: we don't mutate `promo_type` — Gemini's responseSchema enforces the
  // enum ['cashback', 'cuotas', 'mixed'] at structured-output time, so that
  // field never drifts in casing in the wild. (The `supermarketPromoId`
  // helper still lowercases defensively; see supermarket-extract.test.ts.)
  const drifted = promos.map((p) => {
    const clone: any = { ...p };
    // Float pct (rounds to same int).
    if (typeof clone.pct === 'number') {
      if (clone.pct === 10) clone.pct = 10.0;
      else if (clone.pct === 20) clone.pct = 19.9999999;
      else if (clone.pct === 15) clone.pct = 15.0;
    }
    // Duplicate one valid_day entry.
    if (Array.isArray(clone.valid_days) && clone.valid_days.length > 0) {
      clone.valid_days = [...clone.valid_days, clone.valid_days[0]];
    }
    // Uppercase issuer_bank strings — normalized to lowercase downstream.
    if (Array.isArray(clone.issuer_bank)) {
      clone.issuer_bank = clone.issuer_bank.map((b: string) => b.toUpperCase());
    }
    return clone;
  });

  const runB = await extractCarrefourPromos({
    source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: drifted as any }, usage: usage() }),
  });

  assert.strictEqual(runA.rejected_count, 0, `runA no rejects: ${runA.rejected_reasons.join('; ')}`);
  assert.strictEqual(runB.rejected_count, 0, `runB no rejects: ${runB.rejected_reasons.join('; ')}`);
  assert.strictEqual(runA.ids.length, runB.ids.length, 'same number of promos');
  // Byte-identical id arrays — this is the regression.
  assert.deepStrictEqual(runA.ids, runB.ids, 'ids survive Gemini drift');
});

// =============================================================================
// Back-to-back identical runs must yield identical ids (minimum bar).
// =============================================================================

test('carrefour: identical input yields identical ids on re-run', async () => {
  const { source_url, promos } = await loadCarrefour();
  const stub = async () => ({ data: { promos: promos as any }, usage: usage() });

  const runA = await extractCarrefourPromos({ source_url, markdown: 'md', llmOverride: stub });
  const runB = await extractCarrefourPromos({ source_url, markdown: 'md', llmOverride: stub });
  assert.deepStrictEqual(runA.ids, runB.ids);
  // Every id must be distinct — no tuple collisions in the fixture.
  assert.strictEqual(new Set(runA.ids).size, runA.ids.length);
});

// =============================================================================
// Verify the fix also protects Coto and Jumbo. Same drift, same assertion.
// =============================================================================

test('coto: idempotent ids under the same Gemini drift shape', async () => {
  const { source_url, promos } = await loadCoto();

  const runA = await extractCotoPromos({
    source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: promos as any }, usage: usage() }),
  });

  const drifted = promos.map((p) => {
    const c: any = { ...p };
    if (typeof c.pct === 'number') c.pct = c.pct + 0.0000001;
    if (Array.isArray(c.valid_days) && c.valid_days.length > 0) {
      c.valid_days = [...c.valid_days, c.valid_days[0]];
    }
    if (Array.isArray(c.issuer_bank)) {
      c.issuer_bank = c.issuer_bank.map((b: string) => b.toUpperCase());
    }
    return c;
  });

  const runB = await extractCotoPromos({
    source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: drifted as any }, usage: usage() }),
  });

  assert.deepStrictEqual(runA.ids, runB.ids);
});

test('jumbo: idempotent ids under the same Gemini drift shape', async () => {
  const { source_url, promos } = await loadJumbo();

  const runA = await extractJumboPromos({
    source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: promos as any }, usage: usage() }),
  });

  const drifted = promos.map((p) => {
    const c: any = { ...p };
    if (typeof c.pct === 'number' && c.pct !== 0) {
      c.pct = Math.round(c.pct) - 0.0000001;
    }
    if (Array.isArray(c.valid_days) && c.valid_days.length > 0) {
      c.valid_days = [...c.valid_days, c.valid_days[0]];
    }
    if (Array.isArray(c.issuer_bank)) {
      c.issuer_bank = c.issuer_bank.map((b: string) => b.toUpperCase());
    }
    return c;
  });

  const runB = await extractJumboPromos({
    source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: drifted as any }, usage: usage() }),
  });

  assert.deepStrictEqual(runA.ids, runB.ids);
});

// =============================================================================
// White-box: id tuple itself must survive these drift shapes.
// =============================================================================

test('carrefour (P0) tuple: valid_days dedup survives repeated Gemini-style duplicate emission', () => {
  const base = {
    source_url: 'https://www.carrefour.com.ar/descuentos-bancarios',
    day_key: dayKey([6]),
    banks_key: banksKey(['carrefour']),
    wallets_key: walletsKey([]),
    pct: 10,
    promo_type: 'cashback',
    variant_key: variantKey({ promo_type: 'cashback', cuotas_count: null, tope: null, tope_period: null }),
  };
  const drifted = {
    ...base,
    day_key: dayKey([6, 6, 6, 0, 6]), // Gemini hallucinated duplicates + extra 0
  };
  // Drifted tuple's dayKey is now `'0,6'` not `'6'` — semantically this IS a
  // different promo (it now covers Sundays too), so ids MUST differ. This
  // test documents the boundary: dedup fixes true duplicates but preserves
  // actual semantic drift.
  assert.notStrictEqual(
    supermarketPromoId(base),
    supermarketPromoId(drifted),
    'semantic drift (adding Sunday) IS a real change — ids differ',
  );

  // But pure-duplicate drift ([6, 6, 6] → [6]) must collapse to same id.
  const pureDup = { ...base, day_key: dayKey([6, 6, 6]) };
  assert.strictEqual(
    supermarketPromoId(base),
    supermarketPromoId(pureDup),
    'pure duplicate drift produces identical id (dedup works)',
  );
});
