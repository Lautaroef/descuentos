// Ualá — Source-adapter + runner integration.
//
// Per-url source (like MODO): hub enumerates slugs, each detail page yields ONE
// canonical Promo. Exercises the full chain with the generic runner.
//
// Special focus: the **hash-compare skip path**. For per-url sources the runner
// caches `raw_html_hash`. On re-run, if the scraped markdown's hash matches the
// stored hash, Gemini is skipped entirely and `markPromoSeen` bumps
// last_seen_at. This is the cost-saving knob.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  createUalaSource,
  UALA_SOURCE_ID,
  ualaSourceUrl,
  ualaPromoId,
} from '../ingestion/uala-source.js';
import { runSource } from '../lib/source-runner.js';
import * as ualaExtract from '../lib/uala-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'uala');
const NO_USAGE = { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };

async function loadFixture(name: string) {
  const raw = await readFile(resolve(FIXTURES_DIR, `${name}.extract.json`), 'utf8');
  return JSON.parse(raw) as {
    slug: string;
    source_url: string;
    data: Record<string, unknown>;
  };
}
async function loadMarkdown(name: string) {
  return readFile(resolve(FIXTURES_DIR, `${name}.md`), 'utf8');
}

test('uala-source: kind is "per-url", id is "uala"', () => {
  const s = createUalaSource({ slugOverride: 'carrefour' });
  assert.strictEqual(s.kind, 'per-url');
  assert.strictEqual(s.id, UALA_SOURCE_ID);
});

test('uala-source: slugOverride short-circuits the hub (no network call)', async () => {
  const urls = await createUalaSource({ slugOverride: 'carrefour' }).listUrls();
  assert.deepStrictEqual(urls, ['https://www.uala.com.ar/promociones/carrefour']);
});

test('uala-source: slugsOverride → one URL per slug (deterministic order)', async () => {
  const urls = await createUalaSource({ slugsOverride: ['carrefour', 'sportclub'] }).listUrls();
  assert.deepStrictEqual(urls, [
    'https://www.uala.com.ar/promociones/carrefour',
    'https://www.uala.com.ar/promociones/sportclub',
  ]);
});

test('uala-source: scrapeOptions only request markdown (no rawHtml)', () => {
  const s = createUalaSource({ slugOverride: 'x' });
  assert.deepStrictEqual(s.scrapeOptions?.formats, ['markdown']);
  assert.strictEqual(s.scrapeOptions?.waitFor, 6000);
});

test('uala-source: full per-url pipeline end-to-end with stubbed Gemini', async () => {
  const fixture = await loadFixture('promociones-carrefour');
  const md = await loadMarkdown('promociones-carrefour');

  const underlying = createUalaSource({ slugOverride: fixture.slug });
  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const slug = url.replace('https://www.uala.com.ar/promociones/', '');
      const r = await ualaExtract.extractUalaPromo({
        slug,
        markdown: md,
        llmOverride: async () => ({ data: fixture.data as any, usage: NO_USAGE }),
      });
      return { promos: [r.promo], ids: [r.id], cost_usd: 0 };
    },
  };

  const upserts: Array<{ id: string; url: string }> = [];
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ id, promo }) => {
        upserts.push({ id, url: promo.source_url });
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'uala-test',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.inserted, 1);
  assert.strictEqual(rollup.errored, 0);
  assert.strictEqual(upserts.length, 1);
  assert.strictEqual(upserts[0].id, ualaPromoId(fixture.slug));
});

// =============================================================================
// Hash-compare skip — the per-url cost-saving feature.
// =============================================================================

test('uala-source: hash-compare SKIPS Gemini when detail markdown is unchanged', async () => {
  const md = 'cached-markdown-body';
  const hash = createHash('sha256').update(md, 'utf8').digest('hex');
  const slug = 'carrefour';
  const url = ualaSourceUrl(slug);

  const underlying = createUalaSource({ slugOverride: slug });
  let extractCalls = 0;
  const source = {
    ...underlying,
    async extract() {
      extractCalls += 1;
      // If called, return a placeholder — hash-compare should prevent this.
      return {
        promos: [] as any,
        ids: [] as any,
        cost_usd: 0,
      };
    },
  };

  let markSeenCalls = 0;
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map([
        [
          url,
          {
            id: 'stored-id',
            source_id: UALA_SOURCE_ID,
            source_url: url,
            raw_html_hash: hash,
            last_seen_at: new Date(),
          },
        ],
      ]),
      upsertOverride: async () => 'updated',
      markSeenOverride: async () => {
        markSeenCalls += 1;
      },
      runLoggerOverride: {
        start: async () => 'uala-skip',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.unchanged, 1, 'hash-match → unchanged');
  assert.strictEqual(rollup.inserted, 0);
  assert.strictEqual(extractCalls, 0, 'Gemini extract was NOT called (cost savings)');
  assert.strictEqual(markSeenCalls, 1, 'last_seen_at was bumped');
});

test('uala-source: hash-compare triggers extract when stored hash differs (content changed)', async () => {
  const md = 'fresh-markdown-body';
  const staleHash = 'deadbeef'.repeat(8);
  const slug = 'carrefour';
  const url = ualaSourceUrl(slug);

  const underlying = createUalaSource({ slugOverride: slug });
  let extractCalls = 0;
  const source = {
    ...underlying,
    async extract(_url: string, _scrape: any) {
      extractCalls += 1;
      return {
        promos: [
          {
            source_id: UALA_SOURCE_ID,
            source_url: url,
            merchant: 'Carrefour',
            category: 'supermercado' as const,
            wallet: ['uala' as const],
            issuer_bank: ['uala'],
            pct: 10,
            promo_type: 'mixed' as const,
            tope: null,
            tope_period: null,
            valid_days: [6],
            valid_regions: [],
            valid_from: '2026-04-01',
            valid_to: '2026-04-30',
            requires_min_spend: null,
            last_seen_at: new Date().toISOString(),
          },
        ],
        ids: [ualaPromoId(slug)],
        cost_usd: 0.001,
      };
    },
  };

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map([
        [
          url,
          {
            id: 'old-id',
            source_id: UALA_SOURCE_ID,
            source_url: url,
            raw_html_hash: staleHash,
            last_seen_at: new Date(),
          },
        ],
      ]),
      upsertOverride: async () => 'updated',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'uala-change',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.unchanged, 0, 'hash miss → extract');
  assert.strictEqual(rollup.updated, 1);
  assert.strictEqual(extractCalls, 1);
});

test('uala-source: NEW URL (no prior hash) → extract runs, result is inserted', async () => {
  const slug = 'coderhouse';
  const url = ualaSourceUrl(slug);
  const underlying = createUalaSource({ slugOverride: slug });
  let extractCalls = 0;
  const source = {
    ...underlying,
    async extract(_url: string, _scrape: any) {
      extractCalls += 1;
      return {
        promos: [
          {
            source_id: UALA_SOURCE_ID,
            source_url: url,
            merchant: 'Coderhouse',
            category: 'otro' as const,
            wallet: ['uala' as const],
            issuer_bank: ['uala'],
            pct: 20,
            promo_type: 'mixed' as const,
            tope: null,
            tope_period: null,
            valid_days: [0, 1, 2, 3, 4, 5, 6],
            valid_regions: [],
            valid_from: '2026-04-01',
            valid_to: '2026-04-30',
            requires_min_spend: null,
            last_seen_at: new Date().toISOString(),
          },
        ],
        ids: [ualaPromoId(slug)],
        cost_usd: 0.001,
      };
    },
  };
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: 'new-md', rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(), // empty — new URL
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'uala-new',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(extractCalls, 1);
  assert.strictEqual(rollup.inserted, 1);
  assert.strictEqual(rollup.unchanged, 0);
});

test('uala-source: dry-run prints URL list, no scrape or upsert', async () => {
  const source = createUalaSource({ slugsOverride: ['carrefour', 'coderhouse', 'sportclub'] });
  let scrapeCalls = 0;
  const rollup = await runSource(
    source,
    { dryRun: true },
    {
      scrapeOverride: async () => {
        scrapeCalls += 1;
        return { markdown: 'md', rawHtml: null, creditsUsed: 1 };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
    },
  );
  assert.strictEqual(rollup.dry_run, true);
  assert.strictEqual(rollup.url_count, 3);
  assert.strictEqual(scrapeCalls, 0);
});

test('uala-source: invalid URL slug (URL lacks /promociones/<slug>) throws at extract time', async () => {
  const s = createUalaSource();
  // The factory's extract() extracts slug via regex; a URL that doesn't match
  // throws. Simulate by constructing a direct call via the returned Source.
  // We synthesize a listUrls that returns a malformed URL.
  const bad = {
    ...s,
    async listUrls() {
      return ['https://www.uala.com.ar/weird-path/x'];
    },
  };
  const rollup = await runSource(
    bad,
    {},
    {
      scrapeOverride: async () => ({ markdown: 'md', rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'uala-bad',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.errored, 1);
  assert.match(rollup.results[0].error ?? '', /promociones/);
});
