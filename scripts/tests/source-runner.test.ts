// Offline tests for the generic source runner.
//
// We drive the runner with a tiny in-memory Source and with all DB/Firecrawl
// dependencies stubbed via the RunnerTestHooks seam. This covers:
//   - `per-url` kind: hash-compare skip path, upsert path, errored path.
//   - `bulk` kind:    always re-extracts (no hash-compare), upserts N promos.
//   - scrape_runs: startRun/finishRun wired correctly on success and on partial errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { runSource } from '../lib/source-runner.js';
import type { Source } from '../lib/source.js';
import type { Promo } from '../promo-schema.js';
import type { PersistedPromoMeta } from '../lib/promo-repo.js';

function makePromo(overrides: Partial<Promo> = {}): Promo {
  return {
    source_id: 'fake',
    source_url: 'https://example.com/promo/1',
    merchant: 'Test',
    category: 'supermercado',
    wallet: ['modo'],
    pct: 15,
    promo_type: 'cashback',
    tope: 5000,
    tope_period: 'month',
    valid_days: [2],
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

function hashOf(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Build a minimal in-memory source for testing. */
function makeFakeSource(opts: {
  id: string;
  kind: 'per-url' | 'bulk';
  urls: string[];
  /** Called per-URL. Default behavior emits one canonical Promo matching that URL. */
  extractFn?: (url: string, markdown: string) => { promos: Promo[]; ids: string[] };
}): Source {
  const { id, kind, urls } = opts;
  return {
    id,
    kind,
    async listUrls() {
      return urls;
    },
    async extract(url, scrape) {
      if (opts.extractFn) {
        const r = opts.extractFn(url, scrape.markdown);
        return { promos: r.promos, ids: r.ids, cost_usd: 0.001 };
      }
      return {
        promos: [makePromo({ source_id: id, source_url: url })],
        ids: [`id-for-${url}`],
        cost_usd: 0.001,
      };
    },
  };
}

// =============================================================================
// per-url kind — happy path
// =============================================================================

test('runSource per-url: happy path inserts N promos, logs scrape_runs', async () => {
  const urls = ['https://example.com/a', 'https://example.com/b'];
  const source = makeFakeSource({ id: 'fake-perurl', kind: 'per-url', urls });

  const upserts: Array<{ id: string; source_url: string; hash: string }> = [];
  const runRows: Array<{
    phase: 'start' | 'finish';
    source_id?: string;
    run_id?: string;
    promo_count?: number;
    schema_valid?: boolean;
    error?: string | null;
  }> = [];

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async (url) => ({
        markdown: `markdown-for-${url}`,
        rawHtml: null,
        creditsUsed: 1,
      }),
      existingByUrlOverride: new Map(),
      upsertOverride: async ({ id, promo, rawHtmlHash }) => {
        upserts.push({ id, source_url: promo.source_url, hash: rawHtmlHash });
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async (source_id) => {
          runRows.push({ phase: 'start', source_id });
          return 'run-123';
        },
        finish: async (run_id, args) => {
          runRows.push({ phase: 'finish', run_id, ...args });
        },
      },
    },
  );

  assert.strictEqual(rollup.inserted, 2, 'two promos inserted');
  assert.strictEqual(rollup.errored, 0);
  assert.strictEqual(rollup.unchanged, 0);
  assert.strictEqual(rollup.url_count, 2);

  // scrape_runs lifecycle.
  assert.strictEqual(runRows.length, 2);
  assert.deepStrictEqual(runRows[0], { phase: 'start', source_id: 'fake-perurl' });
  assert.strictEqual(runRows[1].phase, 'finish');
  assert.strictEqual(runRows[1].run_id, 'run-123');
  assert.strictEqual(runRows[1].schema_valid, true);
  assert.strictEqual(runRows[1].promo_count, 2);

  // Upserts got the expected hashes.
  for (const u of upserts) {
    const match = urls.find((url) => u.source_url === url);
    assert.ok(match, 'upsert source_url is known');
    assert.strictEqual(u.hash, hashOf(`markdown-for-${match}`), 'upsert carries the markdown hash');
  }
});

// =============================================================================
// per-url kind — hash-compare skip
// =============================================================================

test('runSource per-url: hash-compare skips unchanged URLs (no upsert, calls markSeen)', async () => {
  const url = 'https://example.com/unchanged';
  const source = makeFakeSource({ id: 'fake-perurl', kind: 'per-url', urls: [url] });

  const md = `markdown-for-${url}`;
  const priorHash = hashOf(md);

  const existing = new Map<string, PersistedPromoMeta>([
    [
      url,
      {
        id: 'existing-id',
        source_id: 'fake-perurl',
        source_url: url,
        raw_html_hash: priorHash,
        last_seen_at: new Date(),
      },
    ],
  ]);

  let markSeenCalls = 0;
  let upsertCalls = 0;
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: existing,
      upsertOverride: async () => {
        upsertCalls += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {
        markSeenCalls += 1;
      },
      runLoggerOverride: {
        start: async () => 'run-xyz',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.unchanged, 1, 'unchanged URL reported');
  assert.strictEqual(rollup.inserted, 0);
  assert.strictEqual(upsertCalls, 0, 'upsert NOT called');
  assert.strictEqual(markSeenCalls, 1, 'markPromoSeen called exactly once');
});

// =============================================================================
// per-url kind — partial errors land in scrape_runs
// =============================================================================

test('runSource per-url: one URL errors, run is still written with schema_valid=false', async () => {
  const urls = ['https://example.com/ok', 'https://example.com/bad'];
  const source = makeFakeSource({ id: 'fake-perurl', kind: 'per-url', urls });

  let finishArgs: any = null;

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async (url) => {
        if (url.endsWith('/bad')) throw new Error('synthetic scrape failure');
        return { markdown: `md-${url}`, rawHtml: null, creditsUsed: 1 };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'run-err',
        finish: async (_run_id, args) => {
          finishArgs = args;
        },
      },
    },
  );

  assert.strictEqual(rollup.inserted, 1);
  assert.strictEqual(rollup.errored, 1);
  assert.ok(finishArgs, 'finishRun was called');
  assert.strictEqual(finishArgs.schema_valid, false);
  assert.match(finishArgs.error, /synthetic scrape failure/);
  assert.strictEqual(finishArgs.promo_count, 1, 'promo_count only counts non-errored URLs');
});

// =============================================================================
// bulk kind — one URL yields N promos; hash-compare skip is SUPPRESSED.
// =============================================================================

test('runSource bulk: one URL → N promos, hash-compare does NOT skip even if hash matches', async () => {
  const url = 'https://example.com/article';
  const md = `article-body`;
  const priorHash = hashOf(md);

  const source: Source = {
    id: 'fake-bulk',
    kind: 'bulk',
    async listUrls() {
      return [url];
    },
    async extract(url_, _scrape) {
      // Three promos, all from this one article URL.
      return {
        promos: [
          makePromo({ source_id: 'fake-bulk', source_url: url_, merchant: 'A', pct: 10 }),
          makePromo({ source_id: 'fake-bulk', source_url: url_, merchant: 'B', pct: 20 }),
          makePromo({ source_id: 'fake-bulk', source_url: url_, merchant: 'C', pct: 30 }),
        ],
        ids: ['id-a', 'id-b', 'id-c'],
        cost_usd: 0.003,
      };
    },
  };

  // Pre-seed the "existing" map with a matching hash — for per-url this would
  // trigger the skip; for bulk it must NOT.
  const existing = new Map<string, PersistedPromoMeta>([
    [
      url,
      {
        id: 'existing',
        source_id: 'fake-bulk',
        source_url: url,
        raw_html_hash: priorHash,
        last_seen_at: new Date(),
      },
    ],
  ]);

  let upserts = 0;
  let markSeenCalls = 0;
  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: existing,
      upsertOverride: async () => {
        upserts += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {
        markSeenCalls += 1;
      },
      runLoggerOverride: {
        start: async () => 'run-bulk',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.inserted, 3, 'three promos from one bulk URL');
  assert.strictEqual(rollup.unchanged, 0, 'bulk must re-extract even on hash match');
  assert.strictEqual(upserts, 3);
  assert.strictEqual(markSeenCalls, 0, 'markPromoSeen NOT called for bulk');
  assert.strictEqual(rollup.url_count, 1);
});

// =============================================================================
// dry-run semantics
// =============================================================================

test('runSource: dry-run does not touch scrape_runs and does not call upsert/scrape', async () => {
  const source = makeFakeSource({
    id: 'fake-perurl',
    kind: 'per-url',
    urls: ['https://example.com/a', 'https://example.com/b'],
  });

  let scrapeCalls = 0;
  let upsertCalls = 0;
  let startCalls = 0;
  let finishCalls = 0;

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
      runLoggerOverride: {
        start: async () => {
          startCalls += 1;
          return 'unused';
        },
        finish: async () => {
          finishCalls += 1;
        },
      },
    },
  );

  assert.strictEqual(rollup.dry_run, true);
  assert.strictEqual(rollup.inserted, 0);
  assert.strictEqual(scrapeCalls, 0, 'no scrapes in dry-run');
  assert.strictEqual(upsertCalls, 0, 'no upserts in dry-run');
  assert.strictEqual(startCalls, 0, 'no startRun in dry-run');
  assert.strictEqual(finishCalls, 0, 'no finishRun in dry-run');
  assert.strictEqual(rollup.url_count, 2, 'url_count reflects what would be processed');
});

// =============================================================================
// limit respected
// =============================================================================

test('runSource: --limit caps URL processing', async () => {
  const urls = ['a', 'b', 'c', 'd'].map((n) => `https://example.com/${n}`);
  const source = makeFakeSource({ id: 'fake-perurl', kind: 'per-url', urls });

  let upsertCount = 0;
  const rollup = await runSource(
    source,
    { limit: 2 },
    {
      scrapeOverride: async (url) => ({ markdown: `md-${url}`, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => {
        upsertCount += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'run-limit',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(upsertCount, 2, 'only two URLs processed');
  assert.strictEqual(rollup.url_count, 2);
  assert.strictEqual(rollup.inserted, 2);
});

// =============================================================================
// extract mismatch: promos.length vs ids.length diverge → errored
// =============================================================================

test('runSource: extract() returning mismatched promos/ids reports "errored"', async () => {
  const url = 'https://example.com/bad-adapter';
  const source: Source = {
    id: 'fake-bad',
    kind: 'per-url',
    async listUrls() {
      return [url];
    },
    async extract() {
      return {
        promos: [makePromo({ source_url: url })],
        ids: ['id-1', 'id-2'], // intentional mismatch
      };
    },
  };

  const rollup = await runSource(
    source,
    {},
    {
      scrapeOverride: async () => ({ markdown: 'md', rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'run-bad',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.errored, 1);
  const errMsg = rollup.results[0].error ?? '';
  assert.match(errMsg, /promos\.length/);
});
