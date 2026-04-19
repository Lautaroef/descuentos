// Fixture-based tests for the Carrefour /descuentos-bancarios extractor.
//
// Layered depth:
//   1. Smoke: fixture produces a non-empty, schema-valid Promo[] with the
//      universal cross-wallet row intact.
//   2. Schema conformance: every row passes the canonical Zod `Promo` schema.
//   3. Source-specific invariants: merchant, category, issuer_bank semantics.
//   4. Cross-wallet row shape: 5+ wallets in ONE row (not fanned out).
//   5. cleanCarrefourMarkdown edge cases.
//   6. Canonical id determinism (same inputs → same UUID; different → different).
//   7. Intra-page dedup (same tuple appearing twice collapses to one row).
//   8. Malformed-input resilience (reject path).
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
import { Promo as PromoSchema } from '../promo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, '..', 'samples', 'long-tail', 'super', 'carrefour');

const CARREFOUR_URL = 'https://www.carrefour.com.ar/descuentos-bancarios';

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

function usage() {
  return { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };
}

// =============================================================================
// 1. Smoke — the legacy test preserved.
// =============================================================================

test('carrefour: fixture produces a non-empty, schema-valid Promo[]', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: usage(),
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
  assert.ok(universal!.wallet.includes('cuentadni'), 'Cuenta DNI wallet');
  assert.ok(universal!.wallet.includes('personalpay'), 'Personal Pay wallet');
  assert.ok(universal!.wallet.includes('bna_plus'), 'BNA+ wallet');
  assert.ok(universal!.wallet.includes('prex'), 'Prex wallet');
  assert.strictEqual(universal!.pct, 10);
  assert.strictEqual(universal!.tope, null);
});

// =============================================================================
// 2. cleanCarrefourMarkdown edge cases
// =============================================================================

test('carrefour: cleanCarrefourMarkdown strips embedded VTEX JS blob (> 5000 chars)', () => {
  const junk = 'x'.repeat(8000);
  const md = ['## heading', '', 'real content', junk, 'more content'].join('\n');

  const out = cleanCarrefourMarkdown(md);
  assert.ok(!out.includes(junk), 'long line dropped');
  assert.ok(out.includes('real content'), 'short lines preserved');
  assert.ok(out.includes('more content'));
});

test('carrefour: cleanCarrefourMarkdown empty-input passthrough', () => {
  assert.strictEqual(cleanCarrefourMarkdown(''), '');
  assert.strictEqual(cleanCarrefourMarkdown(undefined as any), '');
  assert.strictEqual(cleanCarrefourMarkdown(null as any), '');
});

test('carrefour: cleanCarrefourMarkdown keeps lines at the 5000-char threshold boundary', () => {
  // Line of exactly 4999 chars must pass through; 5000 must be dropped.
  const just_under = 'a'.repeat(4999);
  const just_over = 'b'.repeat(5001);
  const md = `prefix\n${just_under}\n${just_over}\nsuffix`;

  const out = cleanCarrefourMarkdown(md);
  assert.ok(out.includes(just_under), 'line < 5000 chars preserved');
  assert.ok(!out.includes(just_over), 'line >= 5000 chars dropped');
});

test('carrefour: cleanCarrefourMarkdown collapses 3+ consecutive blank lines to one blank', () => {
  const md = 'a\n\n\n\n\nb';
  const out = cleanCarrefourMarkdown(md);
  assert.strictEqual(out, 'a\n\nb');
});

test('carrefour: cleanCarrefourMarkdown handles plain markdown (no VTEX blob) unchanged', () => {
  const md = '## Heading\n\n- one\n- two\n\n## Another\n';
  const out = cleanCarrefourMarkdown(md);
  assert.ok(out.includes('Heading'));
  assert.ok(out.includes('- one'));
  assert.ok(out.includes('- two'));
});

// =============================================================================
// 3. Schema conformance — every emitted promo validates against the canonical
//    Zod gate.
// =============================================================================

test('carrefour: every extracted promo passes the canonical Promo Zod schema', async () => {
  const fixture = await loadFixture();
  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  assert.strictEqual(result.rejected_count, 0);
  for (const promo of result.promos) {
    const parsed = PromoSchema.safeParse(promo);
    assert.ok(parsed.success, `promo validates: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

// =============================================================================
// 4. Source-specific invariants
// =============================================================================

test('carrefour: source_url is always the Carrefour endpoint', async () => {
  const fixture = await loadFixture();
  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  for (const p of result.promos) {
    assert.strictEqual(p.source_url, CARREFOUR_URL);
  }
});

test('carrefour: wallet may be multi-valued (cross-wallet promos)', async () => {
  const fixture = await loadFixture();
  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  // Fixture has at least one row with wallet.length >= 5.
  const multi = result.promos.filter((p) => p.wallet.length >= 2);
  assert.ok(multi.length > 0, 'at least one multi-wallet row in the fixture');
});

test('carrefour: mercadopago-only cuotas row carries wallet=["mercadopago"], pct=0, cuotas', async () => {
  const fixture = await loadFixture();
  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const mpCuotas = result.promos.find(
    (p) => p.promo_type === 'cuotas' && p.wallet.includes('mercadopago'),
  );
  assert.ok(mpCuotas, 'Mercado Pago cuotas row present');
  assert.strictEqual(mpCuotas!.pct, 0, 'pure cuotas → pct=0');
  assert.strictEqual(mpCuotas!.tope, null);
  assert.deepStrictEqual(mpCuotas!.issuer_bank, undefined, 'MP cuotas has no issuer_bank');
});

test('carrefour: Cuenta Digital row uses issuer_bank=["carrefour"] and empty wallet', async () => {
  const fixture = await loadFixture();
  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const cuentaDigital = result.promos.find(
    (p) => p.pct === 20 && p.issuer_bank?.includes('carrefour'),
  );
  assert.ok(cuentaDigital, 'Cuenta Digital 20% Jueves present');
  assert.deepStrictEqual(cuentaDigital!.issuer_bank, ['carrefour']);
  assert.deepStrictEqual(cuentaDigital!.wallet, [], 'bank-only row has empty wallet');
  assert.strictEqual(cuentaDigital!.tope, 10000);
  assert.strictEqual(cuentaDigital!.tope_period, 'week');
});

// =============================================================================
// 5. Canonical id determinism
// =============================================================================

test('carrefour: same inputs produce identical ids (determinism)', async () => {
  const fixture = await loadFixture();
  const stub = async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() });

  const a = await extractCarrefourPromos({ source_url: fixture.source_url, markdown: 'md', llmOverride: stub });
  const b = await extractCarrefourPromos({ source_url: fixture.source_url, markdown: 'md', llmOverride: stub });
  assert.deepStrictEqual(a.ids, b.ids);
  assert.strictEqual(new Set(a.ids).size, a.ids.length, 'all ids distinct');
});

test('carrefour: changing pct yields a different id', async () => {
  const fixture = await loadFixture();
  const twin = fixture.data.promos.map((p) => ({ ...(p as any) }));
  // Mutate the first row's pct.
  (twin[0] as any).pct = ((twin[0] as any).pct as number) + 5;

  const a = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });
  const b = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: twin as any }, usage: usage() }),
  });

  assert.notStrictEqual(a.ids[0], b.ids[0], 'pct delta → new id');
});

// =============================================================================
// 6. Intra-page dedup — if the LLM emits two rows that distill to the same
//    tuple, the extractor keeps only the first.
// =============================================================================

test('carrefour: duplicated-tuple rows collapse to one promo (intra-page dedup)', async () => {
  const fixture = await loadFixture();
  // Take the first row and append an exact copy with a trivial cosmetic diff
  // (notes field changes but id-tuple fields stay identical).
  const base = fixture.data.promos[0] as any;
  const duplicate = { ...base, notes: 'cosmetic diff — should not produce new id' };
  const payload = [...fixture.data.promos, duplicate];

  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload as any }, usage: usage() }),
  });

  assert.strictEqual(result.rejected_count, 0);
  // Output length should equal the original fixture length, not original+1.
  assert.strictEqual(
    result.promos.length,
    fixture.data.promos.length,
    'duplicate tuple collapsed',
  );
});

// =============================================================================
// 7. Rejection path — one bad row rejects, the rest pass.
// =============================================================================

test('carrefour: injecting one malformed promo rejects only that row', async () => {
  const fixture = await loadFixture();
  const bad = {
    ...(fixture.data.promos[0] as any),
    category: 'FOOD', // invalid enum
    day_phrase: '(injected bad row)',
  };
  const payload = [...fixture.data.promos, bad];

  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload as any }, usage: usage() }),
  });

  assert.strictEqual(result.promos.length, fixture.data.promos.length, 'good rows preserved');
  assert.strictEqual(result.rejected_count, 1, 'bad row rejected');
  assert.match(result.rejected_reasons[0], /category/);
});

test('carrefour: malformed tope_period rejects the row', async () => {
  const fixture = await loadFixture();
  const bad = {
    ...(fixture.data.promos[0] as any),
    tope_period: 'fortnight', // not in enum
  };
  const result = await extractCarrefourPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({
      data: { promos: [bad] as any },
      usage: usage(),
    }),
  });

  assert.strictEqual(result.promos.length, 0);
  assert.strictEqual(result.rejected_count, 1);
});

// =============================================================================
// 8. Empty / malformed payload resilience
// =============================================================================

test('carrefour: empty LLM payload returns zero promos without throwing', async () => {
  const result = await extractCarrefourPromos({
    source_url: CARREFOUR_URL,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: [] }, usage: usage() }),
  });

  assert.strictEqual(result.promos.length, 0);
  assert.strictEqual(result.ids.length, 0);
  assert.strictEqual(result.rejected_count, 0);
});

// =============================================================================
// 9. Source adapter shape
// =============================================================================

test('carrefour: source kind is "bulk" and listUrls returns the default URL', async () => {
  const { createCarrefourSource, CARREFOUR_DEFAULT_URL } = await import('../ingestion/carrefour-source.js');
  const src = createCarrefourSource();
  assert.strictEqual(src.kind, 'bulk');
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, [CARREFOUR_DEFAULT_URL]);
});

test('carrefour: source adapter respects urlOverride', async () => {
  const { createCarrefourSource } = await import('../ingestion/carrefour-source.js');
  const custom = 'https://www.carrefour.com.ar/some-other-catalog';
  const src = createCarrefourSource({ urlOverride: custom });
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, [custom]);
});
