// Runner-integration test for Inngest scheduled ingestion.
//
// What this covers: the closure we pass to `buildIngestFunction()` (i.e. the
// runner that each per-source Inngest function wraps) MUST return a valid
// `RunRollup`, MUST tolerate per-URL errors without throwing, and MUST write a
// `scrape_runs` row via the runner's start/finish hooks.
//
// We drive the generic `runSource()` the same way the per-source runners do,
// feeding stubbed Firecrawl + stubbed upsert + stubbed scrape_runs. This is
// essentially testing the shape of the object a scheduled Inngest function
// will persist after a successful cron tick.
//
// Inngest's own runtime (function execution, step retries, dashboard logs) is
// out of scope — we trust the SDK. What we own is the runner contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { runSource, type RunRollup } from '../lib/source-runner.js';
import type { Source } from '../lib/source.js';
import type { Promo } from '../promo-schema.js';

function hashOf(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function modoLikePromo(url: string): Promo {
  return {
    source_id: 'fake-modo',
    source_url: url,
    merchant: 'Test Merchant',
    category: 'supermercado',
    wallet: ['modo'],
    pct: 20,
    promo_type: 'cashback',
    tope: 10000,
    tope_period: 'week',
    valid_days: [2],
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    last_seen_at: new Date().toISOString(),
  };
}

function makeModoLikeSource(urls: string[]): Source {
  // A MODO-shaped source: per-url kind, one canonical Promo per URL.
  return {
    id: 'fake-modo',
    kind: 'per-url',
    async listUrls() {
      return urls;
    },
    async extract(url) {
      return {
        promos: [modoLikePromo(url)],
        ids: [`uuid-for-${url}`],
        cost_usd: 0.0011,
      };
    },
  };
}

test('scheduled runner: happy path returns RunRollup with populated counts', async () => {
  const urls = [
    'https://www.modo.com.ar/promos/coto-mar26',
    'https://www.modo.com.ar/promos/carrefour-mar26',
  ];
  const source = makeModoLikeSource(urls);

  const upserts: string[] = [];
  const runLog: Array<{ phase: string; args?: unknown }> = [];

  const rollup: RunRollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async (u) => ({
        markdown: `markdown-${u}`,
        rawHtml: null,
        creditsUsed: 1,
      }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ promo }) => {
        upserts.push(promo.source_url);
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => {
          runLog.push({ phase: 'start' });
          return 'run-abc';
        },
        finish: async (_, args) => {
          runLog.push({ phase: 'finish', args });
        },
      },
    },
  );

  // The Inngest function's wrapper returns this object verbatim — these are the
  // fields the dashboard will display. Lock down the contract.
  assert.equal(rollup.source_id, 'fake-modo');
  assert.equal(rollup.run_id, 'run-abc');
  assert.equal(rollup.url_count, 2);
  assert.equal(rollup.inserted, 2);
  assert.equal(rollup.errored, 0);
  assert.equal(rollup.dry_run, false);
  assert.ok(rollup.total_cost_usd > 0, 'cost_usd rolls up from per-URL cost');

  // scrape_runs lifecycle: startRun called once, finishRun once.
  assert.deepEqual(runLog.map((r) => r.phase), ['start', 'finish']);
  const finishArgs = runLog[1].args as {
    promo_count: number;
    schema_valid: boolean;
    error: string | null;
  };
  assert.equal(finishArgs.promo_count, 2);
  assert.equal(finishArgs.schema_valid, true);
  assert.equal(finishArgs.error, null);

  assert.equal(upserts.length, 2);
});

test('scheduled runner: per-URL scrape failure does NOT throw, records error in rollup', async () => {
  const source = makeModoLikeSource([
    'https://www.modo.com.ar/promos/ok',
    'https://www.modo.com.ar/promos/boom',
  ]);

  const finishArgs: { promo_count?: number; schema_valid?: boolean; error?: string | null } = {};

  const rollup = await runSource(
    source,
    { concurrency: 1 },
    {
      scrapeOverride: async (u) => {
        if (u.endsWith('boom')) throw new Error('firecrawl: 502 upstream');
        return { markdown: `md-${u}`, rawHtml: null, creditsUsed: 1 };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'run-1',
        finish: async (_, a) => {
          Object.assign(finishArgs, a);
        },
      },
    },
  );

  // One URL succeeded, one errored. The wrapper returns cleanly (no throw).
  assert.equal(rollup.inserted, 1);
  assert.equal(rollup.errored, 1);

  // scrape_runs row captures the error detail. This is the "alert signal" the
  // health-check later reads — critical to get right.
  assert.equal(finishArgs.schema_valid, false);
  assert.match(finishArgs.error ?? '', /boom/);
  assert.match(finishArgs.error ?? '', /firecrawl: 502/);
});

test('scheduled runner: hash-compare skip avoids upsert + still marks as seen', async () => {
  // Mimics the steady-state cadence: content unchanged from last run, runner
  // fast-paths to `markPromoSeen` and records zero inserts/updates. This is
  // what most weekly re-runs will look like once ingestion stabilizes.
  const url = 'https://www.modo.com.ar/promos/unchanged';
  const source = makeModoLikeSource([url]);

  const md = `md-${url}`;
  const prevHash = hashOf(md);

  let upsertCalls = 0;
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
            id: 'prev-uuid',
            source_id: 'fake-modo',
            source_url: url,
            raw_html_hash: prevHash,
            last_seen_at: new Date(),
          },
        ],
      ]),
      upsertOverride: async () => {
        upsertCalls += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {
        markSeenCalls += 1;
      },
      runLoggerOverride: {
        start: async () => 'run-skip',
        finish: async () => {},
      },
    },
  );

  assert.equal(upsertCalls, 0, 'no upsert when content hash matches');
  assert.equal(markSeenCalls, 1, 'markSeen bumps last_seen_at');
  assert.equal(rollup.unchanged, 1);
  assert.equal(rollup.inserted, 0);
});
