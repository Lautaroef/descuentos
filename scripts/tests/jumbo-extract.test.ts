// Fixture-based tests for the Jumbo cross-bank catalog + Jumbo al 100 extractor.
//
// Layered depth:
//   1. Smoke: both fixtures produce schema-valid Promo[] including the
//      pesoscheck row.
//   2. Schema conformance: every row passes the canonical Zod `Promo` schema.
//   3. Source-specific invariants: merchant, category, wallet enum, Patagonia
//      Sábados tiered split, Naranja X Plan Z cuotas.
//   4. Canonical id determinism.
//   5. Intra-page dedup, rejection path.
//   6. Source adapter shape.
//   7. /jumbo-al-cien cupon row: wallet=['jumbo_mas'] + valid_from < valid_to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JUMBO_SOURCE_ID, extractJumboPromos } from '../lib/jumbo-extract.js';
import { Promo as PromoSchema } from '../promo-schema.js';

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

function usage() {
  return { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };
}

// =============================================================================
// 1. Smoke — the legacy tests preserved
// =============================================================================

test('jumbo: /descuentos-del-dia fixture produces schema-valid Promo[]', async () => {
  const { fixture, md } = await loadPair('descuentos-del-dia');

  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({
      data: { promos: fixture.data.promos as any },
      usage: usage(),
    }),
  });

  assert.strictEqual(result.rejected_count, 0, `no rejects: ${result.rejected_reasons.join('; ')}`);
  assert.ok(result.promos.length > 0, 'at least one promo');

  for (const p of result.promos) {
    assert.strictEqual(p.source_id, JUMBO_SOURCE_ID);
    assert.strictEqual(p.merchant, 'Jumbo');
    assert.strictEqual(p.category, 'supermercado');
  }

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
      usage: usage(),
    }),
  });

  assert.strictEqual(result.rejected_count, 0);
  assert.strictEqual(result.promos.length, 1);

  const p = result.promos[0];
  assert.strictEqual(p.pct, 100, 'Jumbo al 100 headline');
  assert.deepStrictEqual(p.wallet, ['jumbo_mas']);
  assert.strictEqual(p.tope, null);
});

test('jumbo: kind is "bulk" and both default URLs list', async () => {
  const { createJumboSource, JUMBO_DEFAULT_URLS } = await import('../ingestion/jumbo-source.js');
  const src = createJumboSource();
  assert.strictEqual(src.kind, 'bulk');
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, [...JUMBO_DEFAULT_URLS]);
});

// =============================================================================
// 2. Schema conformance — every emitted row passes the canonical Promo
// =============================================================================

test('jumbo: every extracted promo passes the canonical Promo Zod schema', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const result = await extractJumboPromos({
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
// 3. Source-specific invariants
// =============================================================================

test('jumbo: Patagonia Sábados 30% vs 35% are TWO distinct rows (different ids)', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const patagoniaSabados = result.promos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.issuer_bank?.includes('patagonia') && p.valid_days.includes(6));
  assert.strictEqual(patagoniaSabados.length, 2);
  const ids = patagoniaSabados.map(({ i }) => result.ids[i]);
  assert.strictEqual(new Set(ids).size, 2, 'distinct ids');
  const pcts = patagoniaSabados.map(({ p }) => p.pct).sort((a, b) => a - b);
  assert.deepStrictEqual(pcts, [30, 35]);
});

test('jumbo: Naranja X Plan Z cuotas row has pct=0, promo_type="cuotas"', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const naranjaxCuotas = result.promos.find(
    (p) => p.issuer_bank?.includes('naranjax') && p.promo_type === 'cuotas',
  );
  assert.ok(naranjaxCuotas, 'Naranja X Plan Z present');
  assert.strictEqual(naranjaxCuotas!.pct, 0);
  assert.strictEqual(naranjaxCuotas!.tope, null);
});

test('jumbo: Jumbo al 100 pesoscheck row has wallet=["jumbo_mas"] and valid_from < valid_to', async () => {
  const { fixture, md } = await loadPair('jumbo-al-cien');
  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  assert.strictEqual(result.promos.length, 1);
  const p = result.promos[0];
  assert.deepStrictEqual(p.wallet, ['jumbo_mas'], 'exactly the own-cupon wallet');
  assert.ok(
    new Date(p.valid_from).getTime() < new Date(p.valid_to).getTime(),
    'valid_from strictly before valid_to',
  );
});

test('jumbo: every promo wallet is in the canonical enum OR empty (Zod-enforced)', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });

  const allowed = new Set([
    'modo',
    'mercadopago',
    'cuentadni',
    'uala',
    'naranjax',
    'personalpay',
    'brubank',
    'bna_plus',
    'prex',
    'yoy',
    'buepp',
    'lemon',
    'astropay',
    'reba',
    'comunidad_coto',
    'jumbo_mas',
    'mi_carrefour',
  ]);
  for (const p of result.promos) {
    for (const w of p.wallet) {
      assert.ok(allowed.has(w));
    }
  }
});

// =============================================================================
// 4. Canonical id determinism
// =============================================================================

test('jumbo: same inputs produce identical ids (determinism)', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const stub = async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() });

  const a = await extractJumboPromos({ source_url: fixture.source_url, markdown: 'md', llmOverride: stub });
  const b = await extractJumboPromos({ source_url: fixture.source_url, markdown: 'md', llmOverride: stub });
  assert.deepStrictEqual(a.ids, b.ids);
});

test('jumbo: changing valid_days shifts the id', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const promos = fixture.data.promos as any[];
  const twin = promos.map((p, i) => (i === 2 ? { ...p, valid_days: [2] } : { ...p })); // Patagonia row day change

  const a = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: promos as any }, usage: usage() }),
  });
  const b = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: twin as any }, usage: usage() }),
  });

  assert.notStrictEqual(a.ids[2], b.ids[2]);
});

// =============================================================================
// 5. Intra-page dedup + rejection
// =============================================================================

test('jumbo: duplicated-tuple rows collapse (intra-page dedup)', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const base = fixture.data.promos[0] as any;
  const duplicate = { ...base, notes: 'cosmetic' };
  const payload = [...fixture.data.promos, duplicate];
  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload as any }, usage: usage() }),
  });
  assert.strictEqual(result.promos.length, fixture.data.promos.length);
});

test('jumbo: injecting a promo with invalid tope_period rejects only that row', async () => {
  const { fixture } = await loadPair('descuentos-del-dia');
  const bad = { ...(fixture.data.promos[0] as any), tope_period: 'fortnight' };
  const payload = [...fixture.data.promos, bad];

  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload as any }, usage: usage() }),
  });

  // bad row's pct+day+bank collides with a real row → it's deduped FIRST; the
  // surviving row is the LEGIT one. So rejected_count may be 0 here. To test
  // rejection cleanly, we need a row that does NOT collide with any good row.
  // Use a unique day.
  const badUnique = {
    ...(fixture.data.promos[0] as any),
    tope_period: 'fortnight',
    valid_days: [5], // no real Friday-only row in the fixture's first three promos
    pct: 99,
    day_phrase: '(bad unique row)',
  };
  const payload2 = [...fixture.data.promos, badUnique];
  const result2 = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: payload2 as any }, usage: usage() }),
  });

  assert.strictEqual(result2.rejected_count, 1);
  assert.match(result2.rejected_reasons[0], /tope_period/);
  // good rows still present
  assert.strictEqual(result2.promos.length, fixture.data.promos.length);
});

// =============================================================================
// 6. Empty + adapter shape
// =============================================================================

test('jumbo: empty LLM payload returns zero promos', async () => {
  const result = await extractJumboPromos({
    source_url: 'https://www.jumbo.com.ar/descuentos-del-dia',
    markdown: 'md',
    llmOverride: async () => ({ data: { promos: [] }, usage: usage() }),
  });
  assert.strictEqual(result.promos.length, 0);
});

test('jumbo: /jumbo-al-cien URL dispatches the single-row pesoscheck prompt', async () => {
  // White-box check: calling extractJumboPromos with the jumbo-al-cien path
  // should accept a single-row payload just fine. (The prompt selection is
  // internal; we assert the behaviour by round-tripping.)
  const { fixture } = await loadPair('jumbo-al-cien');
  const result = await extractJumboPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: usage() }),
  });
  assert.strictEqual(result.promos.length, 1);
  assert.strictEqual(result.promos[0].pct, 100);
});

test('jumbo: source adapter respects urlOverride', async () => {
  const { createJumboSource } = await import('../ingestion/jumbo-source.js');
  const custom = ['https://www.jumbo.com.ar/jumbo-al-cien'];
  const src = createJumboSource({ urlOverride: custom });
  const urls = await src.listUrls();
  assert.deepStrictEqual(urls, custom);
});
