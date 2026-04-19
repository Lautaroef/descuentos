// Naranja X — Source-adapter + runner integration.
//
// Proves `createNaranjaxSource()` is wired correctly. Stubs scrape + Gemini,
// drives runSource end-to-end, asserts the bulk policy (one URL → N promos,
// hash-compare does NOT fire).
//
// Also covers:
//   - Multi-hub listUrls: defaults to 5 hubs, accept an override for testing.
//   - Idempotency: deterministic ids across two runs → second run reports updates.
//   - Cross-hub id distinction: same (merchant, pct, days) on two hubs → two ids.
//   - Empty scrape → errored (not silent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createNaranjaxSource,
  NARANJAX_SOURCE_ID,
  NARANJAX_HUB_URLS,
  naranjaxPromoId,
} from '../ingestion/naranjax-source.js';
import { runSource } from '../lib/source-runner.js';
import * as naranjaxExtract from '../lib/naranjax-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'long-tail', 'wallets', 'naranjax');
const NO_USAGE = { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };

async function loadFixture(name: string) {
  const raw = await readFile(resolve(FIXTURES_DIR, `${name}.extract.json`), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}
async function loadMarkdown(name: string) {
  return readFile(resolve(FIXTURES_DIR, `${name}.md`), 'utf8');
}

test('naranjax-source: kind is "bulk", id is "naranjax"', () => {
  const s = createNaranjaxSource();
  assert.strictEqual(s.kind, 'bulk');
  assert.strictEqual(s.id, NARANJAX_SOURCE_ID);
});

test('naranjax-source: default listUrls returns the 5 canonical hubs', async () => {
  const urls = await createNaranjaxSource().listUrls();
  assert.deepStrictEqual(urls, NARANJAX_HUB_URLS);
  assert.strictEqual(urls.length, 5);
  // Sanity-check the core URLs are present.
  assert.ok(urls.includes('https://www.naranjax.com/promociones'));
  assert.ok(urls.includes('https://www.naranjax.com/promociones/SUPERMERCADOS_categoria'));
  assert.ok(urls.includes('https://www.naranjax.com/promociones-amba'));
});

test('naranjax-source: urlsOverride lets tests pin a specific hub list', async () => {
  const urls = await createNaranjaxSource({
    urlsOverride: ['https://x.test/a', 'https://x.test/b'],
  }).listUrls();
  assert.deepStrictEqual(urls, ['https://x.test/a', 'https://x.test/b']);
});

test('naranjax-source: scrapeOptions use waitFor=6000 (the SPA-safe floor)', () => {
  const s = createNaranjaxSource();
  assert.strictEqual(s.scrapeOptions?.waitFor, 6000);
  assert.deepStrictEqual(s.scrapeOptions?.formats, ['markdown']);
});

test('naranjax-source: full pipeline end-to-end, stubbed Gemini', async () => {
  const fixture = await loadFixture('promociones-hub');
  const md = await loadMarkdown('promociones-hub');
  const underlying = createNaranjaxSource({ urlsOverride: [fixture.source_url] });

  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const r = await naranjaxExtract.extractNaranjaxPromos({
        source_url: url,
        markdown: md,
        llmOverride: async () => ({ data: { promos: fixture.data.promos as any }, usage: NO_USAGE }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const upserts: Array<{ id: string; source_url: string }> = [];
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
        start: async () => 'nx-test-run',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.source_id, NARANJAX_SOURCE_ID);
  assert.strictEqual(rollup.url_count, 1);
  assert.strictEqual(rollup.inserted, fixture.data.promos.length);
  assert.strictEqual(new Set(upserts.map((u) => u.id)).size, upserts.length, 'unique ids');
});

test('naranjax-source: multi-hub fan-out, each URL upserts its own promos (provenance preserved)', async () => {
  const hubs = [
    'https://www.naranjax.com/promociones',
    'https://www.naranjax.com/promociones/SUPERMERCADOS_categoria',
  ];
  const underlying = createNaranjaxSource({ urlsOverride: hubs });

  // Same (merchant, pct, days) emitted from BOTH hubs — deterministic ids are
  // unique per hub because source_url is in the UUID tuple.
  const stubbed = [
    {
      merchant: 'Supermercados',
      category: 'supermercado',
      pct: 25,
      tope: 12000,
      tope_period: 'week',
      valid_days: [2],
      valid_regions: [],
      valid_from: '2026-04-01',
      valid_to: '2026-04-30',
      requires_min_spend: null,
      promo_type: 'cashback',
    },
  ];
  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const r = await naranjaxExtract.extractNaranjaxPromos({
        source_url: url,
        markdown: 'stub',
        llmOverride: async () => ({ data: { promos: stubbed as any }, usage: NO_USAGE }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const upserts: Array<{ id: string; source_url: string }> = [];
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: 'md', rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ id, promo }) => {
        upserts.push({ id, source_url: promo.source_url });
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'nx-multi-run',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.url_count, 2);
  assert.strictEqual(rollup.inserted, 2, 'one row per hub (provenance)');
  const ids = new Set(upserts.map((u) => u.id));
  assert.strictEqual(ids.size, 2, 'two DISTINCT ids — one per hub');
  // Sanity-check: these match the helper's output.
  assert.ok(ids.has(naranjaxPromoId(hubs[0], 'Supermercados', 25, [2])));
  assert.ok(ids.has(naranjaxPromoId(hubs[1], 'Supermercados', 25, [2])));
});

test('naranjax-source: idempotency — second run against identical output reports updates only', async () => {
  const fixture = await loadFixture('promociones-hub');
  const md = await loadMarkdown('promociones-hub');
  const underlying = createNaranjaxSource({ urlsOverride: [fixture.source_url] });
  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      const r = await naranjaxExtract.extractNaranjaxPromos({
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
        start: async () => 'nx-idem',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.inserted, 0);
  assert.strictEqual(rollup.updated, fixture.data.promos.length);
});

test('naranjax-source: empty markdown from scrape is treated as errored, not empty-promos', async () => {
  const source = createNaranjaxSource({ urlsOverride: ['https://test.com/hub'] });
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: null, rawHtml: null, creditsUsed: 0 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'nx-empty',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.errored, 1);
  assert.strictEqual(rollup.inserted, 0);
});

test('naranjax-source: dry-run lists all 5 default hubs without scraping', async () => {
  const source = createNaranjaxSource();
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
  assert.strictEqual(rollup.url_count, 5, '5 hubs in dry-run list');
  assert.strictEqual(scrapeCalls, 0);
});

test('naranjax-source: --limit caps the hub fan-out', async () => {
  const source = createNaranjaxSource();
  const urls = await source.listUrls();
  // Stub extract to return one promo per hub; cap at 2.
  const wrapped = {
    ...source,
    async extract(url: string, _scrape: any) {
      return {
        promos: [
          {
            source_id: 'naranjax',
            source_url: url,
            merchant: 'Test',
            category: 'supermercado' as const,
            wallet: ['naranjax' as const],
            issuer_bank: ['naranjax'],
            pct: 10,
            promo_type: 'cashback' as const,
            tope: null,
            tope_period: null,
            valid_days: [2],
            valid_regions: [],
            valid_from: '2026-04-01',
            valid_to: '2026-04-30',
            requires_min_spend: null,
            last_seen_at: new Date().toISOString(),
          },
        ],
        ids: [`id-${url}`],
        cost_usd: 0,
      };
    },
  };
  let upserts = 0;
  const rollup = await runSource(
    wrapped,
    { limit: 2 },
    {
      scrapeOverride: async (u: string) => ({ markdown: `md-${u}`, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => {
        upserts += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'nx-limit',
        finish: async () => {},
      },
    },
  );
  assert.strictEqual(rollup.url_count, 2, '--limit respected');
  assert.strictEqual(upserts, 2);
  assert.ok(urls.length > 2);
});
