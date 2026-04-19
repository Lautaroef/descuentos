// Integration test for the Cuenta DNI Source adapter.
//
// Exercises the `createCuentaDniSource()` adapter through the generic
// `runSource()` runner with stubbed scrape + stubbed Gemini + stubbed DB.
// The goal: prove the adapter is correctly wired as a `bulk` source (one URL →
// many Promos) and that the per-promo upserts hit the DB surface we expect.
//
// Uses the Ámbito April 2026 fixture to avoid any network calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCuentaDniSource, CUENTADNI_SOURCE_ID } from '../ingestion/cuentadni-source.js';
import { runSource } from '../lib/source-runner.js';
import * as cuentaDniExtract from '../lib/cuentadni-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'samples', 'cuentadni-press-extraction');

async function loadFixture() {
  const raw = await readFile(resolve(FIXTURES_DIR, 'ambito-abril-2026.extract.json'), 'utf8');
  return JSON.parse(raw) as {
    source_url: string;
    data: { promos: Array<Record<string, unknown>> };
  };
}

async function loadMarkdown() {
  return readFile(resolve(FIXTURES_DIR, 'ambito-abril-2026.md'), 'utf8');
}

test('cuentadni-source: end-to-end with article override + stubbed Gemini', async () => {
  const fixture = await loadFixture();
  const md = await loadMarkdown();

  // Monkey-patch the LLM layer. `extractCuentaDniPromos` takes an `llmOverride`
  // arg, but we call it through the Source.extract() → runSource() path which
  // doesn't expose that. Instead: swap out the module-level extractor via a
  // small shim Source that wraps ours with a known-good payload.
  const underlying = createCuentaDniSource({ articleOverride: fixture.source_url });
  const source = {
    ...underlying,
    async extract(url: string, _scrape: any) {
      // Call the extractor directly with the stubbed LLM — same path the adapter
      // uses in production, just with the Gemini hop replaced.
      const r = await cuentaDniExtract.extractCuentaDniPromos({
        source_url: url,
        markdown: md,
        llmOverride: async () => ({
          data: { promos: fixture.data.promos as any },
          usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
        }),
      });
      return {
        promos: r.promos,
        ids: r.ids,
        cost_usd: r.usage.cost_usd,
      };
    },
  };

  const upserts: Array<{ id: string; source_url: string; source_id: string }> = [];
  let runId: string | null = null;
  let finishArgs: any = null;

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ id, promo }) => {
        upserts.push({ id, source_url: promo.source_url, source_id: promo.source_id });
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => {
          runId = 'cd-run-test';
          return runId;
        },
        finish: async (_run_id, args) => {
          finishArgs = args;
        },
      },
    },
  );

  assert.strictEqual(rollup.source_id, CUENTADNI_SOURCE_ID);
  assert.strictEqual(rollup.url_count, 1, 'one article URL');
  assert.strictEqual(rollup.inserted, 9, 'nine promos from the fixture');
  assert.strictEqual(rollup.errored, 0);

  // Every upsert shares the same source_url + source_id (bulk semantics).
  for (const u of upserts) {
    assert.strictEqual(u.source_id, CUENTADNI_SOURCE_ID);
    assert.strictEqual(u.source_url, fixture.source_url);
  }
  // Nine distinct ids.
  assert.strictEqual(new Set(upserts.map((u) => u.id)).size, 9);

  // scrape_runs finish carries the rollup counts.
  assert.ok(finishArgs);
  assert.strictEqual(finishArgs.schema_valid, true);
  assert.strictEqual(finishArgs.promo_count, 9);
});

test('cuentadni-source: kind is "bulk"', () => {
  const source = createCuentaDniSource({ articleOverride: 'https://example.com/fake' });
  assert.strictEqual(source.kind, 'bulk');
  assert.strictEqual(source.id, CUENTADNI_SOURCE_ID);
});

test('cuentadni-source: articleOverride short-circuits listUrls (no network)', async () => {
  const fakeUrl = 'https://example.com/custom-article';
  const source = createCuentaDniSource({ articleOverride: fakeUrl });
  const urls = await source.listUrls();
  assert.deepStrictEqual(urls, [fakeUrl]);
});
