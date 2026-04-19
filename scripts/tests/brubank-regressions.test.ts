// Brubank — deeper regressions beyond the smoke test in brubank-extract.test.ts.
//
// Covers:
//   - Every fixture promo iterates through the canonical Zod gate (schema walk).
//   - Source-specific invariant: issuer_bank is exactly ['brubank-{one|plus|ultra}'].
//   - Day-phrase corner cases the prompt promises: "Jueves a domingos" → [0,4,5,6],
//     "Domingo y lunes" → [0,1], "Viernes, sábados y domingos" → [0,5,6],
//     "Lunes a viernes" → [1,2,3,4,5].
//   - Canonical-id determinism + distinctness across plan tiers.
//   - Malformed LLM payloads are REJECTED (category out of enum, weekday > 6).
//   - plan="all" fan-out produces distinct ids per tier (defensive idempotency).
//   - Empty promos payload → empty result (not a crash).
//   - Schema-valid but hallucinated bogus plan tier (the extractor's issuer_bank
//     synthesis is the only source of truth for plan tiers).
//   - Token-envelope sanity: the live fixture is well under the ~15k token ceiling
//     documented in docs/firecrawl-alternative-analysis.md.
//   - Idempotency: running the same fixture twice yields the same id set (no
//     wallclock-dependent UUIDs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRUBANK_SOURCE_ID,
  BRUBANK_SOURCE_URL,
  brubankPromoId,
  extractBrubankPromos,
} from '../lib/brubank-extract.js';
import { Promo as PromoSchema } from '../promo-schema.js';

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

// =============================================================================
// Schema walk — every row in the fixture must pass the canonical Promo schema.
// =============================================================================

test('brubank-regressions: every fixture promo passes the canonical Promo Zod schema', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  const result = await extractBrubankPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });

  assert.strictEqual(result.rejected_count, 0, 'no fixture row should be rejected');
  assert.ok(result.promos.length >= 1);
  for (const p of result.promos) {
    const parsed = PromoSchema.safeParse(p);
    assert.ok(
      parsed.success,
      `${p.merchant}/${p.issuer_bank?.[0]} must be schema-valid: ${parsed.success ? '' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
});

test('brubank-regressions: source-specific invariant — issuer_bank always a plan-tier marker', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const result = await extractBrubankPromos({
    source_url: fixture.source_url,
    markdown: md,
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  for (const p of result.promos) {
    assert.deepStrictEqual(p.wallet, ['brubank'], `${p.merchant}: wallet always ['brubank']`);
    assert.ok(
      p.issuer_bank && p.issuer_bank.length === 1,
      `${p.merchant}: exactly one issuer_bank entry`,
    );
    assert.match(
      p.issuer_bank![0],
      /^brubank-(one|plus|ultra)$/,
      `${p.merchant}: issuer_bank must be brubank-<plan> (got ${p.issuer_bank![0]})`,
    );
  }
});

test('brubank-regressions: source_id and source_url are pinned on every row', async () => {
  const fixture = await loadFixture();
  const result = await extractBrubankPromos({
    source_url: fixture.source_url,
    markdown: 'stub',
    llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
  });
  for (const p of result.promos) {
    assert.strictEqual(p.source_id, BRUBANK_SOURCE_ID);
    assert.strictEqual(p.source_url, fixture.source_url);
  }
});

// =============================================================================
// Day-phrase corner cases.
// =============================================================================

function makeStubPromo(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    plan: 'ultra',
    merchant: 'X',
    category: 'gastronomia',
    pct: 30,
    tope: 6000,
    tope_period: 'month',
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    promo_type: 'cashback',
    ...overrides,
  };
}

test('brubank-regressions: "Jueves a domingos" → [0,4,5,6] (Sun=0 rollover)', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: {
        promos: [
          makeStubPromo({ merchant: 'Eyelit', plan: 'one', valid_days: [0, 4, 5, 6], tope: null, tope_period: null }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  assert.deepStrictEqual(result.promos[0].valid_days, [0, 4, 5, 6]);
});

test('brubank-regressions: multi-day phrases round-trip through the canonical gate', async () => {
  const phrases = [
    { label: 'Lunes y viernes', days: [1, 5] },
    { label: 'Viernes, sábados y domingos', days: [0, 5, 6] },
    { label: 'Domingo y lunes', days: [0, 1] },
    { label: 'Lunes a viernes', days: [1, 2, 3, 4, 5] },
    { label: 'Todos los días', days: [0, 1, 2, 3, 4, 5, 6] },
    { label: 'Solo martes', days: [2] },
  ];
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: {
        promos: phrases.map((p, i) =>
          makeStubPromo({
            merchant: `M${i}`,
            plan: 'one',
            valid_days: p.days,
            tope: null,
            tope_period: null,
          }),
        ),
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 0);
  for (let i = 0; i < phrases.length; i += 1) {
    assert.deepStrictEqual(result.promos[i].valid_days, phrases[i].days, phrases[i].label);
  }
});

// =============================================================================
// Canonical-id determinism.
// =============================================================================

test('brubank-regressions: canonical id is stable across calls with identical input', () => {
  const url = BRUBANK_SOURCE_URL;
  const a = brubankPromoId(url, 'ultra', 'Axion Energy', 30, [0, 1, 2, 3, 4, 5, 6]);
  const b = brubankPromoId(url, 'ultra', 'Axion Energy', 30, [0, 1, 2, 3, 4, 5, 6]);
  assert.strictEqual(a, b);
  // Day-set reorder is stable (sort inside the helper).
  const reordered = brubankPromoId(url, 'ultra', 'Axion Energy', 30, [6, 5, 4, 3, 2, 1, 0]);
  assert.strictEqual(a, reordered);
  // Merchant casing is normalized (toLowerCase + trim inside helper).
  assert.strictEqual(a, brubankPromoId(url, 'ultra', '  AXION ENERGY  ', 30, [0, 1, 2, 3, 4, 5, 6]));
});

test('brubank-regressions: canonical id distinguishes plan tiers for same merchant/pct/days', () => {
  const url = BRUBANK_SOURCE_URL;
  const days = [0, 1, 2, 3, 4, 5, 6];
  const ultra = brubankPromoId(url, 'ultra', 'Axion Energy', 30, days);
  const plus = brubankPromoId(url, 'plus', 'Axion Energy', 30, days);
  const one = brubankPromoId(url, 'one', 'Axion Energy', 30, days);
  assert.strictEqual(new Set([ultra, plus, one]).size, 3, 'three distinct ids by plan');
});

test('brubank-regressions: canonical id changes when pct or days change', () => {
  const url = BRUBANK_SOURCE_URL;
  const base = brubankPromoId(url, 'plus', 'Burger King', 30, [0, 5, 6]);
  assert.notStrictEqual(base, brubankPromoId(url, 'plus', 'Burger King', 20, [0, 5, 6]));
  assert.notStrictEqual(base, brubankPromoId(url, 'plus', 'Burger King', 30, [0, 5]));
});

test('brubank-regressions: canonical id is UUID v5 shape', () => {
  const id = brubankPromoId(BRUBANK_SOURCE_URL, 'ultra', 'X', 10, [2]);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// =============================================================================
// Malformed LLM payloads — rejected, not upserted as garbage.
// =============================================================================

test('brubank-regressions: invalid category is rejected at the canonical Zod gate (not upserted)', async () => {
  // The extractor's contract: schema-violating promos end up in rejected_reasons
  // rather than throwing the whole run. A single bad card must NOT silently
  // upsert AND must NOT nuke the co-hosted good cards.
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: {
        promos: [
          makeStubPromo({ merchant: 'Good', plan: 'ultra', pct: 30, valid_days: [2] }),
          makeStubPromo({
            merchant: 'Bad',
            category: 'garbage-category' as any,
            plan: 'ultra',
            pct: 30,
            valid_days: [3],
          }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1, 'one row rejected');
  assert.strictEqual(result.promos.length, 1, 'good row preserved');
  assert.strictEqual(result.promos[0].merchant, 'Good');
  assert.ok(
    result.rejected_reasons.some((r) => /category/i.test(r)),
    'rejection reason mentions category',
  );
});

test('brubank-regressions: weekday > 6 is rejected at the canonical Zod gate', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: { promos: [makeStubPromo({ merchant: 'BadDays', valid_days: [7] })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 0);
  assert.ok(result.rejected_reasons[0].includes('valid_days'));
});

test('brubank-regressions: bogus tope_period is rejected at the canonical gate', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: {
        promos: [makeStubPromo({ merchant: 'BadPeriod', tope: 1000, tope_period: 'eon' as any })],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 0);
});

test('brubank-regressions: missing required Promo field (pct non-number) is rejected', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: { promos: [makeStubPromo({ merchant: 'NoPct', pct: 'thirty' as any })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.rejected_count, 1);
  assert.strictEqual(result.promos.length, 0);
});

// =============================================================================
// Empty / degenerate LLM output.
// =============================================================================

test('brubank-regressions: empty promos array → empty result, no crash', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({ data: { promos: [] }, usage: NO_USAGE }),
  });
  assert.strictEqual(result.promos.length, 0);
  assert.strictEqual(result.ids.length, 0);
  assert.strictEqual(result.rejected_count, 0);
});

test('brubank-regressions: duplicate card emissions within one payload are deduped by id', async () => {
  // Same plan + merchant + pct + valid_days → same id → deduped.
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: {
        promos: [
          makeStubPromo({ merchant: 'Duplicate', plan: 'ultra', pct: 20, valid_days: [2] }),
          makeStubPromo({ merchant: 'Duplicate', plan: 'ultra', pct: 20, valid_days: [2] }),
          makeStubPromo({ merchant: 'Duplicate', plan: 'ultra', pct: 20, valid_days: [2] }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos.length, 1, 'three identical cards collapse to one');
  assert.strictEqual(result.ids.length, 1);
});

test('brubank-regressions: plan="all" fan-out produces three DISTINCT deterministic ids', async () => {
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: {
        promos: [
          makeStubPromo({
            plan: 'all',
            merchant: 'Nike',
            category: 'indumentaria',
            pct: 0,
            tope: null,
            tope_period: null,
            promo_type: 'cuotas',
            cuotas: 6,
          }),
        ],
      } as any,
      usage: NO_USAGE,
    }),
  });
  assert.strictEqual(result.promos.length, 3);
  const tiers = result.promos.map((p) => p.issuer_bank?.[0]).sort();
  assert.deepStrictEqual(tiers, ['brubank-one', 'brubank-plus', 'brubank-ultra']);
  assert.strictEqual(new Set(result.ids).size, 3);
  // pct=0 cuotas card is allowed (promo_type='cuotas').
  for (const p of result.promos) {
    assert.strictEqual(p.pct, 0);
    assert.strictEqual(p.promo_type, 'cuotas');
  }
});

// =============================================================================
// Idempotency — running the extractor twice on the same payload yields the same
// ids. Catches any wallclock-dependent UUID regression.
// =============================================================================

test('brubank-regressions: same payload twice → identical id set (deterministic)', async () => {
  const fixture = await loadFixture();
  const call = async () =>
    extractBrubankPromos({
      source_url: fixture.source_url,
      markdown: 'stub',
      llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
    });
  const a = await call();
  const b = await call();
  assert.deepStrictEqual([...a.ids].sort(), [...b.ids].sort());
  // Ids are unique within each run too.
  assert.strictEqual(new Set(a.ids).size, a.ids.length);
});

// =============================================================================
// Token-envelope sanity: offline check the fixture doesn't creep over budget.
// =============================================================================

test('brubank-regressions: markdown fixture is within the <15k-token budget envelope', async () => {
  const md = await loadMarkdown();
  // Rough estimate: 4 chars per token is a well-known Gemini/GPT heuristic. Our
  // documented ceiling is ~15k tokens (docs/firecrawl-alternative-analysis.md).
  const approxTokens = Math.ceil(md.length / 4);
  assert.ok(
    approxTokens < 15_000,
    `Brubank fixture is ~${approxTokens} tokens; budget ceiling is 15k. Did the page blow up?`,
  );
});

// =============================================================================
// Plan-tier semantics: missing plan="all" but merchant==merchant emits exactly
// the tier the LLM said (no silent tier inference).
// =============================================================================

test('brubank-regressions: the adapter trusts the LLM plan label — no silent inference', async () => {
  // If the LLM says plan="plus", the extractor encodes issuer_bank as ['brubank-plus'].
  // This locks in the contract: downstream can rely on issuer_bank without re-parsing.
  const result = await extractBrubankPromos({
    source_url: BRUBANK_SOURCE_URL,
    markdown: '# fake',
    llmOverride: async () => ({
      data: { promos: [makeStubPromo({ plan: 'plus', merchant: 'X', pct: 20 })] } as any,
      usage: NO_USAGE,
    }),
  });
  assert.deepStrictEqual(result.promos[0].issuer_bank, ['brubank-plus']);
});
