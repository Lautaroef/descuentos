// Offline fixture tests for extractModoPromo.
//
// Each of the 10 MODO stress-test fixtures has markdown in `scripts/samples/modo-stress/raw/`
// and a known-good LLM baseline in `scripts/samples/modo-stress/extraction-sweep.json`. We
// stub the Gemini call with that baseline (so tests run offline, free, deterministic) and
// assert the extractor's post-processing produces a canonical-schema-valid Promo.
//
// The two regressions we guard here are:
//   1. rawHtml `data-testid="day-of-week-selected-..."` regex must override the LLM's
//      `valid_days` when present.
//   2. The "Vigencia Del DD/MM/YY al DD/MM/YY" UI-block regex must override the LLM's
//      `valid_from`/`valid_to` when it disagrees (this is the ~6/10 benchmark finding).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractModoPromo,
  modoPromoId,
  modoSourceUrl,
  validDaysFromRawHtml,
  vigenciaFromMarkdown,
} from '../lib/modo-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(__dirname, '..', 'samples', 'modo-stress');

interface SweepPage {
  slug: string;
  url: string;
  edge_case?: string;
  extract_v1: { result?: Record<string, unknown> };
  extract_v2?: { result?: Record<string, unknown> };
}

interface Fixture {
  slug: string;
  url: string;
  edge_case?: string;
  /** LLM baseline — either extract_v2.result (preferred) or extract_v1.result. */
  llm_result: Record<string, unknown>;
  /** Expected final valid_days, valid_from, valid_to AFTER our post-processing. */
  expected: {
    valid_days: number[];
    valid_from: string;
    valid_to: string;
    /** True iff my Vigencia regex should override the LLM-provided dates. */
    dates_from_vigencia: boolean;
    /** True if rawHtml regex fallback is tested for this slug (we synthesize rawHtml). */
    valid_days_from_rawhtml: boolean;
  };
}

// Final expected values after running rawHtml-override + Vigencia-override on top of the
// LLM baseline. Dates come from the UI Vigencia block in the fixture markdown (the
// canonical public vigencia). valid_days come from the LLM baseline UNLESS we synthesize a
// rawHtml with data-testid markers (only coto-mar26 below does that, to exercise the
// override path).
const EXPECTED: Record<string, Fixture['expected']> = {
  'coto-mar26': {
    valid_days: [2], // synthesized rawHtml forces [2] even though LLM already said [2]
    valid_from: '2026-02-28',
    valid_to: '2026-04-30',
    dates_from_vigencia: true,
    valid_days_from_rawhtml: true,
  },
  'supermiercoles-santander-info-mar26-jun26': {
    valid_days: [3],
    valid_from: '2026-03-24',
    valid_to: '2026-06-24',
    dates_from_vigencia: true,
    valid_days_from_rawhtml: false,
  },
  'carrefour-mar26': {
    // LLM baseline is [1,2,3,4,5,6] (wrong per human spot-check), but we accept it as-is
    // since we're testing our post-processing pipeline, not re-running extraction.
    valid_days: [1, 2, 3, 4, 5, 6],
    valid_from: '2026-03-06',
    valid_to: '2026-04-25',
    dates_from_vigencia: false,
    valid_days_from_rawhtml: false,
  },
  '30-corrientes-supermercados-ene26': {
    valid_days: [3, 4],
    valid_from: '2025-12-31',
    valid_to: '2026-12-31',
    dates_from_vigencia: false,
    valid_days_from_rawhtml: false,
  },
  '20-aiello-rm-supervielle-mar26': {
    valid_days: [2],
    valid_from: '2026-02-28',
    valid_to: '2026-05-31',
    dates_from_vigencia: true,
    valid_days_from_rawhtml: false,
  },
  '3csi-farmacias-bna-mar24': {
    valid_days: [1],
    valid_from: '2024-03-03',
    valid_to: '2026-05-31',
    dates_from_vigencia: true,
    valid_days_from_rawhtml: false,
  },
  'openfarma-abril26': {
    valid_days: [2, 4],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    dates_from_vigencia: false,
    valid_days_from_rawhtml: false,
  },
  'transportevqr-abril26': {
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_from: '2026-04-05',
    valid_to: '2026-04-30',
    dates_from_vigencia: false,
    valid_days_from_rawhtml: false,
  },
  '30-bica-comerciosadheridos-abr26': {
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_from: '2026-03-31',
    valid_to: '2026-06-30',
    dates_from_vigencia: true,
    valid_days_from_rawhtml: false,
  },
  '3csi-simplicity-macro-abr26': {
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_from: '2026-03-31',
    valid_to: '2026-04-30',
    dates_from_vigencia: true,
    valid_days_from_rawhtml: false,
  },
};

async function loadFixtures(): Promise<Fixture[]> {
  const sweepRaw = await readFile(resolve(SAMPLES_DIR, 'extraction-sweep.json'), 'utf8');
  const sweep = JSON.parse(sweepRaw) as { pages: SweepPage[] };

  const fixtures: Fixture[] = [];
  for (const page of sweep.pages) {
    const llm_result = page.extract_v2?.result ?? page.extract_v1?.result;
    if (!llm_result) {
      throw new Error(`Fixture ${page.slug} has no extract_v2.result or extract_v1.result`);
    }
    const expected = EXPECTED[page.slug];
    if (!expected) {
      throw new Error(`No expected-value table entry for ${page.slug}`);
    }
    fixtures.push({
      slug: page.slug,
      url: page.url,
      edge_case: page.edge_case,
      llm_result: { ...llm_result },
      expected,
    });
  }
  return fixtures;
}

// Synthesize a rawHtml snippet containing `data-testid="day-of-week-selected-<L>"` for each
// selected ISO weekday. Used only on the `coto-mar26` fixture to exercise the override path.
const ISO_TO_LETTER: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
function synthRawHtml(validDays: number[]): string {
  const parts: string[] = ['<html><body>'];
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    const letter = ISO_TO_LETTER[d];
    if (validDays.includes(d)) {
      parts.push(`<span data-testid="day-of-week-selected-${letter}">${letter}</span>`);
    } else {
      parts.push(`<span data-testid="day-of-week-${letter}">${letter}</span>`);
    }
  }
  parts.push('</body></html>');
  return parts.join('\n');
}

test('modoPromoId is deterministic and URL-based', () => {
  const a = modoPromoId('coto-mar26');
  const b = modoPromoId('coto-mar26');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, modoPromoId('openfarma-abril26'));
  // Valid v5 UUID shape.
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('modoSourceUrl formats the expected host + slug', () => {
  assert.strictEqual(modoSourceUrl('coto-mar26'), 'https://www.modo.com.ar/promos/coto-mar26');
});

test('validDaysFromRawHtml maps letter suffixes to ISO days, or returns null', () => {
  assert.deepStrictEqual(validDaysFromRawHtml(null), null);
  assert.deepStrictEqual(validDaysFromRawHtml('<span data-testid="day-of-week-L">L</span>'), null);
  assert.deepStrictEqual(
    validDaysFromRawHtml(synthRawHtml([2])),
    [2],
    'Tuesday only',
  );
  assert.deepStrictEqual(
    validDaysFromRawHtml(synthRawHtml([2, 4])),
    [2, 4],
    'Martes y jueves',
  );
  assert.deepStrictEqual(
    validDaysFromRawHtml(synthRawHtml([0, 1, 2, 3, 4, 5, 6])),
    [0, 1, 2, 3, 4, 5, 6],
    'Todos los dias',
  );
});

test('vigenciaFromMarkdown parses the Vigencia block across all fixtures', async () => {
  const fixtures = await loadFixtures();
  for (const f of fixtures) {
    const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${f.slug}.md`), 'utf8');
    const vig = vigenciaFromMarkdown(md);
    assert.ok(vig, `Vigencia block not found for ${f.slug}`);
    assert.strictEqual(vig!.from, f.expected.valid_from, `${f.slug} valid_from`);
    assert.strictEqual(vig!.to, f.expected.valid_to, `${f.slug} valid_to`);
  }
});

test('vigenciaFromMarkdown returns null when the block is absent', () => {
  assert.strictEqual(vigenciaFromMarkdown(null), null);
  assert.strictEqual(vigenciaFromMarkdown('arbitrary text with no vigencia block'), null);
});

test('extractModoPromo end-to-end on all 10 fixtures (offline LLM stub)', async () => {
  const fixtures = await loadFixtures();
  for (const f of fixtures) {
    const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${f.slug}.md`), 'utf8');
    const rawHtml = f.expected.valid_days_from_rawhtml
      ? synthRawHtml(f.expected.valid_days)
      : null;

    const result = await extractModoPromo({
      slug: f.slug,
      markdown: md,
      rawHtml,
      llmOverride: async () => ({
        data: f.llm_result as any,
        usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
      }),
    });

    const { promo } = result;

    // Stable identity.
    assert.strictEqual(promo.source_id, 'modo', `${f.slug} source_id`);
    assert.strictEqual(promo.source_url, f.url, `${f.slug} source_url`);
    assert.deepStrictEqual(promo.wallet, ['modo'], `${f.slug} wallet`);

    // valid_days override path.
    assert.deepStrictEqual(promo.valid_days, f.expected.valid_days, `${f.slug} valid_days`);

    // Vigencia override path.
    assert.strictEqual(promo.valid_from, f.expected.valid_from, `${f.slug} valid_from`);
    assert.strictEqual(promo.valid_to, f.expected.valid_to, `${f.slug} valid_to`);

    // Override-flag reporting reflects the actual override taken.
    assert.strictEqual(
      result.overrides.dates_from_vigencia,
      f.expected.dates_from_vigencia,
      `${f.slug} overrides.dates_from_vigencia`,
    );
    assert.strictEqual(
      result.overrides.valid_days_from_rawhtml,
      f.expected.valid_days_from_rawhtml &&
        // only true if the synthesized rawHtml actually disagrees with the LLM baseline
        JSON.stringify(f.expected.valid_days) !== JSON.stringify(f.llm_result.valid_days),
      `${f.slug} overrides.valid_days_from_rawhtml`,
    );

    // promo_type derived from pct.
    const pct = (f.llm_result as { pct: number }).pct;
    assert.strictEqual(
      promo.promo_type,
      pct === 0 ? 'cuotas' : 'cashback',
      `${f.slug} promo_type`,
    );

    // tope_period is either null or a valid enum — canonical schema gate already
    // verified this. We don't force null-on-null because the LLM baselines disagree
    // (3csi-simplicity emits tope_period=month with tope=null; schema allows it).
    if (promo.tope_period !== null) {
      assert.match(
        String(promo.tope_period),
        /^(ticket|day|week|month)$/,
        `${f.slug} tope_period is a valid enum value`,
      );
    }

    // last_seen_at is ISO datetime.
    assert.match(
      promo.last_seen_at,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      `${f.slug} last_seen_at`,
    );
  }
});

test('extractModoPromo — multi-rate Supermiércoles variants are preserved', async () => {
  const slug = 'supermiercoles-santander-info-mar26-jun26';
  const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${slug}.md`), 'utf8');
  const fixtures = await loadFixtures();
  const f = fixtures.find((x) => x.slug === slug)!;

  const result = await extractModoPromo({
    slug,
    markdown: md,
    rawHtml: null,
    llmOverride: async () => ({
      data: f.llm_result as any,
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.ok(result.promo.variants, 'variants should be present');
  assert.strictEqual(result.promo.variants!.length, 2, 'two variants (25% indumentaria + 10% perfumería)');
  assert.strictEqual(result.promo.pct, 25, 'primary pct is highest rate');
});

test('extractModoPromo — cuotas-only fixtures flagged as promo_type=cuotas', async () => {
  const slugs = ['3csi-farmacias-bna-mar24', '3csi-simplicity-macro-abr26'];
  const fixtures = await loadFixtures();
  for (const slug of slugs) {
    const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${slug}.md`), 'utf8');
    const f = fixtures.find((x) => x.slug === slug)!;
    const result = await extractModoPromo({
      slug,
      markdown: md,
      rawHtml: null,
      llmOverride: async () => ({
        data: f.llm_result as any,
        usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
      }),
    });
    assert.strictEqual(result.promo.pct, 0, `${slug} pct is 0`);
    assert.strictEqual(result.promo.promo_type, 'cuotas', `${slug} promo_type is cuotas`);
  }
});
