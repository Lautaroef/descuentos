// Personal Pay — Source-adapter + runner integration.
//
// Partial-coverage bulk source: one hub URL → N promos with tope=null.
// Exercises the full runner chain + the defensive tope-null guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPersonalPaySource,
  PERSONALPAY_SOURCE_ID,
  PERSONALPAY_SOURCE_URL,
} from '../ingestion/personalpay-source.js';
import { runSource } from '../lib/source-runner.js';
import * as ppExtract from '../lib/personalpay-extract.js';

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

test('personalpay-source: kind is "bulk", id is "personalpay"', () => {
  const s = createPersonalPaySource();
  assert.strictEqual(s.kind, 'bulk');
  assert.strictEqual(s.id, PERSONALPAY_SOURCE_ID);
});

test('personalpay-source: default listUrls is the short-form canonical URL', async () => {
  const urls = await createPersonalPaySource().listUrls();
  assert.deepStrictEqual(urls, [PERSONALPAY_SOURCE_URL]);
});

test('personalpay-source: urlOverride lets tests pin a mirror', async () => {
  const urls = await createPersonalPaySource({
    urlOverride: 'https://test.example/pp-staging',
  }).listUrls();
  assert.deepStrictEqual(urls, ['https://test.example/pp-staging']);
});

test('personalpay-source: scrapeOptions use waitFor=6000 and markdown-only', () => {
  const s = createPersonalPaySource();
  assert.strictEqual(s.scrapeOptions?.waitFor, 6000);
  assert.deepStrictEqual(s.scrapeOptions?.formats, ['markdown']);
});

test('personalpay-source: full pipeline end-to-end, stubbed Gemini', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const underlying = createPersonalPaySource({ urlOverride: fixture.source_url });
  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const r = await ppExtract.extractPersonalPayPromos({
        source_url: url,
        markdown: md,
        llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const upserts: any[] = [];
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ id, promo }) => {
        upserts.push({ id, tope: promo.tope, tope_period: promo.tope_period });
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'pp-run',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.source_id, PERSONALPAY_SOURCE_ID);
  assert.strictEqual(rollup.inserted, fixture.data.promos.length);
  // Contract: every upserted row has tope=null.
  for (const u of upserts) {
    assert.strictEqual(u.tope, null, 'tope must be null in upsert');
    assert.strictEqual(u.tope_period, null);
  }
});

test('personalpay-source: idempotency — second run reports updates, not inserts', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();
  const underlying = createPersonalPaySource({ urlOverride: fixture.source_url });
  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const r = await ppExtract.extractPersonalPayPromos({
        source_url: url,
        markdown: md,
        llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'updated',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'pp-idem',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.inserted, 0);
  assert.strictEqual(rollup.updated, fixture.data.promos.length);
});

test('personalpay-source: empty markdown from scrape → errored', async () => {
  const source = createPersonalPaySource();
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: null, rawHtml: null, creditsUsed: 0 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'pp-empty',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.errored, 1);
  assert.strictEqual(rollup.inserted, 0);
  assert.match(rollup.results[0].error ?? '', /empty markdown/);
});

test('personalpay-source: runner-level tope-null contract holds even if Gemini hallucinates', async () => {
  // Belt-and-suspenders: even if the LLM returns non-null topes, by the time
  // promos hit upsert they must be null. This proves the defensive guard in the
  // extractor plays correctly with the runner surface.
  const source = createPersonalPaySource({ urlOverride: 'https://test.example/pp' });
  const wrapped = {
    ...source,
    async extract(url: string, _scrape: any) {
      const r = await ppExtract.extractPersonalPayPromos({
        source_url: url,
        markdown: 'stub',
        llmOverride: async () => ({
          data: {
            promos: [
              {
                merchant: 'Hallucinated',
                category: 'farmacia',
                pct: 10,
                tope: 9999, // hallucinated
                tope_period: 'month',
                valid_days: [3],
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
    },
  };
  const upserted: any[] = [];
  const rollup = await runSource(
    wrapped,
    {},
    {
      scrapeOverride: async () => ({ markdown: 'md', rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ promo }) => {
        upserted.push(promo);
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'pp-halluc',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.inserted, 1);
  assert.strictEqual(upserted[0].tope, null);
  assert.strictEqual(upserted[0].tope_period, null);
});

test('personalpay-source: dry-run lists the URL but never scrapes', async () => {
  const source = createPersonalPaySource();
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
  assert.strictEqual(rollup.url_count, 1);
  assert.strictEqual(scrapeCalls, 0);
});
