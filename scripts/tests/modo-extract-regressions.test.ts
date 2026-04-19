// Regression tests for the two MODO extraction bugs we can now prove don't recur.
//
// These tests sit alongside `modo-extract.test.ts` (which asserts end-to-end correctness
// on every fixture). Here we deliberately construct *disagreements* between the stubbed
// Gemini response and the fixture's canonical values so the override paths are FORCED to
// fire, and then assert (a) the final promo uses the canonical values, and (b) the
// divergence is surfaced — either through the returned `overrides` flag or through an
// info-level log line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractModoPromo,
  validDaysFromRawHtml,
  vigenciaFromMarkdown,
} from '../lib/modo-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(__dirname, '..', 'samples', 'modo-stress');

// Letter-to-ISO-day map must match scripts/lib/modo-extract.ts.
const ISO_TO_LETTER: Record<number, string> = {
  0: 'D',
  1: 'L',
  2: 'M',
  3: 'X',
  4: 'J',
  5: 'V',
  6: 'S',
};

/** Build a rawHtml snippet that marks the given ISO weekdays as selected. */
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

interface LlmBaseline {
  merchant: string;
  category: string;
  pct: number;
  tope: number | null;
  tope_period: 'ticket' | 'day' | 'week' | 'month' | '' | null;
  valid_days: number[];
  valid_regions: string[];
  valid_from: string;
  valid_to: string;
  requires_min_spend: number | null;
  issuer_bank?: string[];
  wallet?: string[];
  valid_days_reasoning?: string;
  variants?: unknown[];
}

/**
 * Build a minimal-but-valid LLM payload keyed on a subset of real-world values.
 * Callers override just the fields they want to exercise.
 */
function baseline(overrides: Partial<LlmBaseline> = {}): LlmBaseline {
  return {
    merchant: 'Test Merchant',
    category: 'supermercado',
    pct: 10,
    tope: 5000,
    tope_period: 'month',
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_regions: [],
    valid_from: '2026-01-01',
    valid_to: '2026-01-31',
    requires_min_spend: null,
    issuer_bank: ['galicia'],
    wallet: ['modo'],
    valid_days_reasoning: 'stubbed for tests',
    ...overrides,
  };
}

function captureConsoleLog(): { restore: () => void; lines: string[] } {
  const lines: string[] = [];
  const original = console.log;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log = (...args: any[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

// =============================================================================
// P0-1 — Vigencia override regression.
//
// Picks 2 fixtures whose UI Vigencia block and legal-text dates disagree:
//   - 20-aiello-rm-supervielle-mar26:
//       legal text → 2026-03-01 / 2026-05-31 (ish), Vigencia → 2026-02-28 / 2026-05-31
//   - 3csi-simplicity-macro-abr26:
//       legal text → 2026-04-01 / 2026-04-30, Vigencia → 2026-03-31 / 2026-04-30
//
// We stub Gemini to emit the LEGAL-TEXT dates and assert the extractor overrides them to
// the UI Vigencia dates, and that the divergence is both flagged on the returned
// `overrides` object AND logged at info level (console.log).
// =============================================================================

interface VigenciaCase {
  slug: string;
  // Legal-text dates (what the LLM would naively return on these pages).
  legalFrom: string;
  legalTo: string;
  // Canonical Vigencia-block dates (what the UI publishes).
  vigenciaFrom: string;
  vigenciaTo: string;
}

const VIGENCIA_CASES: VigenciaCase[] = [
  {
    slug: '20-aiello-rm-supervielle-mar26',
    legalFrom: '2026-03-01',
    legalTo: '2026-05-31',
    vigenciaFrom: '2026-02-28',
    vigenciaTo: '2026-05-31',
  },
  {
    slug: '3csi-simplicity-macro-abr26',
    legalFrom: '2026-04-01',
    legalTo: '2026-04-30',
    vigenciaFrom: '2026-03-31',
    vigenciaTo: '2026-04-30',
  },
];

for (const c of VIGENCIA_CASES) {
  test(`P0-1 Vigencia override fires for ${c.slug} when LLM returns legal-text dates`, async () => {
    const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${c.slug}.md`), 'utf8');

    // Sanity check: the fixture really does contain the Vigencia block we're asserting on.
    const vig = vigenciaFromMarkdown(md);
    assert.ok(vig, `${c.slug} fixture missing Vigencia block`);
    assert.strictEqual(vig!.from, c.vigenciaFrom);
    assert.strictEqual(vig!.to, c.vigenciaTo);

    const cap = captureConsoleLog();
    let result;
    try {
      result = await extractModoPromo({
        slug: c.slug,
        markdown: md,
        rawHtml: null,
        llmOverride: async () => ({
          data: baseline({
            valid_from: c.legalFrom,
            valid_to: c.legalTo,
            pct: c.slug.startsWith('3csi-') ? 0 : 20,
          }) as never,
          usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
        }),
      });
    } finally {
      cap.restore();
    }

    // Final promo uses the UI Vigencia dates, NOT the stubbed LLM dates.
    assert.strictEqual(result.promo.valid_from, c.vigenciaFrom, 'override applied to valid_from');
    assert.strictEqual(result.promo.valid_to, c.vigenciaTo, 'override applied to valid_to');

    // Override flag is reported on the result.
    assert.strictEqual(
      result.overrides.dates_from_vigencia,
      true,
      'overrides.dates_from_vigencia is true',
    );

    // Divergence was logged at info level with the slug and both dates.
    const divergenceLog = cap.lines.find(
      (l) =>
        l.includes(`[modo:${c.slug}] Vigencia override`) &&
        l.includes(c.vigenciaFrom) &&
        l.includes(c.legalFrom),
    );
    assert.ok(
      divergenceLog,
      `expected a Vigencia-override info log for ${c.slug}; captured lines:\n${cap.lines.join('\n')}`,
    );
  });
}

test('P0-1 Vigencia override does NOT fire when LLM already matches the UI block', async () => {
  // Even when Vigencia is parseable, we only flag divergence when the LLM disagrees.
  const slug = '20-aiello-rm-supervielle-mar26';
  const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${slug}.md`), 'utf8');
  const vig = vigenciaFromMarkdown(md)!;

  const cap = captureConsoleLog();
  let result;
  try {
    result = await extractModoPromo({
      slug,
      markdown: md,
      rawHtml: null,
      llmOverride: async () => ({
        data: baseline({
          valid_from: vig.from,
          valid_to: vig.to,
          pct: 20,
        }) as never,
        usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
      }),
    });
  } finally {
    cap.restore();
  }

  assert.strictEqual(result.overrides.dates_from_vigencia, false, 'no divergence → flag false');
  // No [modo:...] Vigencia override log line should fire.
  assert.ok(
    !cap.lines.some((l) => l.includes('Vigencia override')),
    'no divergence log when LLM agrees',
  );
});

// =============================================================================
// P0-2 — valid_days rawHtml regex regression.
//
// The "all 7 days" LLM failure mode was documented in docs/modo-stress-test.md:
// before the v2 prompt + rawHtml fallback, specific-weekday promos like COTO Martes and
// Supermiércoles returned [0..6]. The production fix is the data-testid regex on rawHtml.
//
// These tests force that failure mode — stub Gemini to return [0..6] — and assert the
// final promo contains ONLY the correct days because rawHtml overrode the LLM.
// =============================================================================

interface ValidDaysCase {
  slug: string;
  merchant: string;
  correctDays: number[];
  description: string;
}

const VALID_DAYS_CASES: ValidDaysCase[] = [
  {
    slug: 'coto-mar26',
    merchant: 'COTO',
    correctDays: [2],
    description: 'Supermartes — Tuesdays only',
  },
  {
    slug: 'supermiercoles-santander-info-mar26-jun26',
    merchant: 'Supermiércoles Santander',
    correctDays: [3],
    description: 'Supermiércoles — Wednesdays only',
  },
];

for (const c of VALID_DAYS_CASES) {
  test(`P0-2 rawHtml regex overrides LLM [0..6] for ${c.slug} (${c.description})`, async () => {
    const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${c.slug}.md`), 'utf8');

    // Emulate the exact failure mode: LLM returned "every day".
    const llmBad = baseline({
      valid_days: [0, 1, 2, 3, 4, 5, 6],
      pct: 10,
      // use the slug-appropriate Vigencia so the canonical gate passes cleanly.
      valid_from: '2026-02-28',
      valid_to: '2026-06-30',
    });

    // Synthesize the rawHtml the real Firecrawl scrape would return for a
    // specific-weekday promo.
    const rawHtml = synthRawHtml(c.correctDays);

    const result = await extractModoPromo({
      slug: c.slug,
      markdown: md,
      rawHtml,
      llmOverride: async () => ({
        data: llmBad as never,
        usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
      }),
    });

    assert.deepStrictEqual(
      result.promo.valid_days,
      c.correctDays,
      `valid_days narrowed from [0..6] to ${JSON.stringify(c.correctDays)}`,
    );
    assert.strictEqual(
      result.overrides.valid_days_from_rawhtml,
      true,
      'overrides.valid_days_from_rawhtml is true when rawHtml disagrees with LLM',
    );
  });
}

test('P0-2 valid_days_from_rawhtml stays false when rawHtml agrees with the LLM', async () => {
  // Same slug as above but LLM returns the correct [2]. Override flag must be false even
  // though rawHtml also says [2], because nothing was overridden.
  const slug = 'coto-mar26';
  const md = await readFile(resolve(SAMPLES_DIR, 'raw', `${slug}.md`), 'utf8');
  const rawHtml = synthRawHtml([2]);

  const result = await extractModoPromo({
    slug,
    markdown: md,
    rawHtml,
    llmOverride: async () => ({
      data: baseline({
        valid_days: [2],
        pct: 10,
        valid_from: '2026-02-28',
        valid_to: '2026-04-30',
      }) as never,
      usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
    }),
  });

  assert.deepStrictEqual(result.promo.valid_days, [2]);
  assert.strictEqual(result.overrides.valid_days_from_rawhtml, false);
});

test('P0-2 ISO-to-letter mapping round-trips through validDaysFromRawHtml', () => {
  // Every individual day must survive the round-trip — documents the L/M/X/J/V/S/D map.
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const out = validDaysFromRawHtml(synthRawHtml([day]));
    assert.deepStrictEqual(out, [day], `ISO ${day} (${ISO_TO_LETTER[day]})`);
  }
});
