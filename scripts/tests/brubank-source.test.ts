// Brubank — Source-adapter + runner integration (P2: end-to-end with stubs).
//
// Proves `createBrubankSource()` is wired correctly into the generic runSource()
// pipeline: stub scrape + stub Gemini + stub DB surface, run the whole chain,
// assert the rollup reports the expected shape.
//
// Also covers:
//   - Idempotency: second run against identical stubbed output → 0 inserts, N updates.
//   - Schema-violating Gemini output is skipped at the adapter, not upserted as garbage.
//   - `kind === 'bulk'` — one URL → N promos, hash-compare skip does NOT fire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHash } from 'node:crypto';

import { createBrubankSource, BRUBANK_SOURCE_ID } from '../ingestion/brubank-source.js';
import { runSource } from '../lib/source-runner.js';
import * as brubankExtract from '../lib/brubank-extract.js';

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

function wrap(underlying: ReturnType<typeof createBrubankSource>, fixture: any, md: string) {
  return {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const r = await brubankExtract.extractBrubankPromos({
        source_url: url,
        markdown: md,
        llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: r.usage.cost_usd };
    },
  };
}

test('brubank-source: kind is "bulk", id is "brubank"', () => {
  const source = createBrubankSource();
  assert.strictEqual(source.kind, 'bulk');
  assert.strictEqual(source.id, BRUBANK_SOURCE_ID);
});

test('brubank-source: listUrls returns a single beneficios URL (single-page catalog)', async () => {
  const source = createBrubankSource({ urlOverride: 'https://staging.brubank.com/beneficios' });
  const urls = await source.listUrls();
  assert.strictEqual(urls.length, 1);
  assert.strictEqual(urls[0], 'https://staging.brubank.com/beneficios');
});

test('brubank-source: full pipeline end-to-end with stubbed scrape + stubbed Gemini', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const source = wrap(
    createBrubankSource({ urlOverride: fixture.source_url }),
    fixture,
    md,
  );

  const upserts: Array<{ id: string; source_url: string }> = [];
  let finishArgs: any = null;
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ id, promo }) => {
        upserts.push({ id, source_url: promo.source_url });
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'brubank-test-run',
        finish: async (_id, args) => {
          finishArgs = args;
        },
      },
    },
  );

  assert.strictEqual(rollup.source_id, BRUBANK_SOURCE_ID);
  assert.strictEqual(rollup.url_count, 1);
  assert.strictEqual(rollup.errored, 0);
  assert.strictEqual(rollup.inserted, fixture.data.promos.length, 'one row per fixture promo');
  assert.strictEqual(upserts.length, fixture.data.promos.length);
  assert.strictEqual(new Set(upserts.map((u) => u.id)).size, upserts.length, 'distinct ids');
  assert.ok(finishArgs);
  assert.strictEqual(finishArgs.schema_valid, true);
});

test('brubank-source: idempotency — second run reports all updates, zero inserts', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const source = wrap(createBrubankSource({ urlOverride: fixture.source_url }), fixture, md);

  // Pretend the DB already has every id (returns 'updated' rather than 'inserted').
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'updated',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'brubank-idem-run',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.inserted, 0, 'no fresh inserts on re-run');
  assert.strictEqual(rollup.updated, fixture.data.promos.length);
  assert.strictEqual(rollup.errored, 0);
});

test('brubank-source: hash-compare skip does NOT fire for bulk (even with matching hash)', async () => {
  // Bulk policy: we always re-extract. A cached hash is ignored.
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const source = wrap(createBrubankSource({ urlOverride: fixture.source_url }), fixture, md);

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map([
        [
          fixture.source_url,
          {
            id: 'pre-existing',
            source_id: BRUBANK_SOURCE_ID,
            source_url: fixture.source_url,
            raw_html_hash: createHash('sha256').update(md, 'utf8').digest('hex'),
            last_seen_at: new Date(),
          },
        ],
      ]),
      upsertOverride: async () => 'updated',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'brubank-hash-run',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.unchanged, 0, 'bulk ignores hash-compare skip');
  assert.strictEqual(rollup.updated, fixture.data.promos.length);
});

test('brubank-source: empty markdown from scrape → errored, no upserts', async () => {
  const source = createBrubankSource();
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: null, rawHtml: null, creditsUsed: 0 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'brubank-empty-run',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.errored, 1);
  assert.strictEqual(rollup.inserted, 0);
  assert.match(rollup.results[0].error ?? '', /empty markdown/);
});

test('brubank-source: schema-violating Gemini output degrades gracefully (rejects row, completes run)', async () => {
  // Gemini hallucinates one row with an invalid category; the adapter filters it
  // out via the canonical Zod gate and emits console.warn. The run completes,
  // the surviving rows get upserted, and schema_valid stays true at the runner
  // level because the URL itself did not error (runner-level schema_valid is
  // about scrape_runs errors, not individual-row canonical-schema rejects).
  const source = createBrubankSource();
  const fakeExtract = async (url: string, _scrape: any) => {
    const r = await brubankExtract.extractBrubankPromos({
      source_url: url,
      markdown: 'stub',
      llmOverride: async () => ({
        data: {
          promos: [
            {
              plan: 'ultra',
              merchant: 'Good',
              category: 'gastronomia',
              pct: 30,
              tope: 6000,
              tope_period: 'month',
              valid_days: [2],
              valid_regions: [],
              valid_from: '2026-04-01',
              valid_to: '2026-04-30',
              requires_min_spend: null,
              promo_type: 'cashback',
            },
            {
              plan: 'ultra',
              merchant: 'Bad',
              category: 'garbage-category',
              pct: 30,
              tope: null,
              tope_period: null,
              valid_days: [2],
              valid_regions: [],
              valid_from: '2026-04-01',
              valid_to: '2026-04-30',
              requires_min_spend: null,
              promo_type: 'cashback',
            },
          ],
        } as any,
        usage: NO_USAGE,
      }),
    });
    return { promos: r.promos, ids: r.ids, cost_usd: 0 };
  };
  const wrapped = { ...source, extract: fakeExtract };

  let upsertCalls = 0;
  const rollup = await runSource(
    wrapped,
    {},
    {
      scrapeOverride: async () => ({ markdown: 'stub', rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => {
        upsertCalls += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'brubank-bad-row-run',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.errored, 0);
  assert.strictEqual(upsertCalls, 1, 'only the good row upserted');
  assert.strictEqual(rollup.inserted, 1);
});

test('brubank-source: dry-run lists the URL but does not scrape / upsert', async () => {
  const source = createBrubankSource();
  let scrapeCalls = 0;
  let upsertCalls = 0;
  const rollup = await runSource(
    source,
    { dryRun: true },
    {
      scrapeOverride: async () => {
        scrapeCalls += 1;
        return { markdown: 'md', rawHtml: null, creditsUsed: 1 };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => {
        upsertCalls += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {},
    },
  );
  assert.strictEqual(rollup.dry_run, true);
  assert.strictEqual(scrapeCalls, 0);
  assert.strictEqual(upsertCalls, 0);
  assert.strictEqual(rollup.url_count, 1, 'URL count reported');
});
