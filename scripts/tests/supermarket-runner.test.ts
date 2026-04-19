// Runner-integration tests for the 3 supermarket sources (Coto, Jumbo,
// Carrefour) + P0 idempotency deep-dive.
//
// Each test wires a real Source adapter (createXxxSource) into runSource via
// RunnerTestHooks, stubbing Firecrawl and the DB. This proves:
//
//   - Adapters drop through the generic runner with correct shape.
//   - Bulk-kind URLs re-extract on every run (no hash-compare skip).
//   - Running the SAME adapter with the SAME stubbed scrape + LLM output on
//     TWO back-to-back runs produces 0 inserts on the second run (THIS is the
//     Carrefour idempotency regression — had the bug shipped, it would have
//     asserted 1+ insert on run 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSource } from '../lib/source-runner.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';
import type { PersistedPromoMeta } from '../lib/promo-repo.js';

import { extractCarrefourPromos, CARREFOUR_SOURCE_ID } from '../lib/carrefour-extract.js';
import { extractCotoPromos, COTO_SOURCE_ID } from '../lib/coto-extract.js';
import { extractJumboPromos, JUMBO_SOURCE_ID } from '../lib/jumbo-extract.js';
import { cleanCarrefourMarkdown } from '../ingestion/carrefour-source.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_SUPER = resolve(__dirname, '..', 'samples', 'long-tail', 'super');

function usage() {
  return { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 };
}

async function loadExtract(
  sub: string,
  slug: string,
): Promise<{ source_url: string; promos: any[] }> {
  const raw = await readFile(resolve(FIX_SUPER, sub, `${slug}.extract.json`), 'utf8');
  const fixture = JSON.parse(raw) as {
    source_url: string;
    data: { promos: any[] };
  };
  return { source_url: fixture.source_url, promos: fixture.data.promos };
}

async function loadMd(sub: string, slug: string): Promise<string> {
  return readFile(resolve(FIX_SUPER, sub, `${slug}.md`), 'utf8');
}

// =============================================================================
// Carrefour — end-to-end runner integration + idempotency
// =============================================================================

test('runner: carrefour source runs end-to-end with stubbed scrape + LLM', async () => {
  const fx = await loadExtract('carrefour', 'descuentos-bancarios');
  const md = await loadMd('carrefour', 'descuentos-bancarios');

  const carrefourSource: Source = {
    id: CARREFOUR_SOURCE_ID,
    kind: 'bulk',
    async listUrls() {
      return [fx.source_url];
    },
    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const cleaned = cleanCarrefourMarkdown(scrape.markdown);
      const r = await extractCarrefourPromos({
        source_url: url,
        markdown: cleaned,
        llmOverride: async () => ({ data: { promos: fx.promos as any }, usage: usage() }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  let upserts = 0;
  const rollup = await runSource(
    carrefourSource,
    {},
    {
      scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
      existingByUrlOverride: new Map(),
      upsertOverride: async () => {
        upserts += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'run-carrefour-stub',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.errored, 0);
  assert.ok(rollup.inserted > 0, 'inserts recorded');
  assert.strictEqual(rollup.unchanged, 0, 'bulk does not hash-compare skip');
  assert.strictEqual(upserts, rollup.inserted);
});

// P0: Carrefour idempotency — two back-to-back runs against the SAME inputs
// yield 0 inserts on the second run.
test('runner (P0): carrefour second run produces 0 inserts (idempotency)', async () => {
  const fx = await loadExtract('carrefour', 'descuentos-bancarios');
  const md = await loadMd('carrefour', 'descuentos-bancarios');

  // Minimal in-memory DB: id → last hash.
  const dbByUrl = new Map<string, PersistedPromoMeta>();
  const dbById = new Set<string>();

  const carrefourSource: Source = {
    id: CARREFOUR_SOURCE_ID,
    kind: 'bulk',
    async listUrls() {
      return [fx.source_url];
    },
    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const cleaned = cleanCarrefourMarkdown(scrape.markdown);
      const r = await extractCarrefourPromos({
        source_url: url,
        markdown: cleaned,
        llmOverride: async () => ({ data: { promos: fx.promos as any }, usage: usage() }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const buildHooks = () => ({
    scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
    existingByUrlOverride: dbByUrl,
    upsertOverride: async (args: { id: string; promo: any; rawHtmlHash: string }) => {
      const action: 'inserted' | 'updated' = dbById.has(args.id) ? 'updated' : 'inserted';
      dbById.add(args.id);
      dbByUrl.set(args.promo.source_url, {
        id: args.id,
        source_id: CARREFOUR_SOURCE_ID,
        source_url: args.promo.source_url,
        raw_html_hash: args.rawHtmlHash,
        last_seen_at: new Date(),
      });
      return action;
    },
    markSeenOverride: async () => {},
    runLoggerOverride: {
      start: async () => 'run-carrefour-idem',
      finish: async () => {},
    },
  });

  const run1 = await runSource(carrefourSource, {}, buildHooks());
  const run2 = await runSource(carrefourSource, {}, buildHooks());

  assert.ok(run1.inserted > 0, 'run1 inserts');
  assert.strictEqual(run1.updated, 0, 'run1 has no updates (nothing in DB yet)');

  // P0 assertion: run2 inserts NOTHING, everything is an update.
  assert.strictEqual(
    run2.inserted,
    0,
    `run2 should have 0 inserts, got ${run2.inserted} — canonical id not stable`,
  );
  assert.strictEqual(run2.updated, run1.inserted, 'run2 updates == run1 inserts');
  assert.strictEqual(run2.errored, 0);
});

// =============================================================================
// Coto — end-to-end + idempotency
// =============================================================================

test('runner: coto source runs end-to-end and achieves 0-insert idempotency on re-run', async () => {
  const fx = await loadExtract('coto', 'cotodigital-descuentos');
  const md = await loadMd('coto', 'cotodigital-descuentos');

  const dbByUrl = new Map<string, PersistedPromoMeta>();
  const dbById = new Set<string>();

  const cotoSource: Source = {
    id: COTO_SOURCE_ID,
    kind: 'bulk',
    async listUrls() {
      return [fx.source_url];
    },
    async extract(url, scrape) {
      const r = await extractCotoPromos({
        source_url: url,
        markdown: scrape.markdown,
        llmOverride: async () => ({ data: { promos: fx.promos as any }, usage: usage() }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const buildHooks = () => ({
    scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
    existingByUrlOverride: dbByUrl,
    upsertOverride: async (args: { id: string; promo: any; rawHtmlHash: string }) => {
      const action: 'inserted' | 'updated' = dbById.has(args.id) ? 'updated' : 'inserted';
      dbById.add(args.id);
      dbByUrl.set(args.promo.source_url, {
        id: args.id,
        source_id: COTO_SOURCE_ID,
        source_url: args.promo.source_url,
        raw_html_hash: args.rawHtmlHash,
        last_seen_at: new Date(),
      });
      return action;
    },
    markSeenOverride: async () => {},
    runLoggerOverride: {
      start: async () => 'run-coto',
      finish: async () => {},
    },
  });

  const run1 = await runSource(cotoSource, {}, buildHooks());
  const run2 = await runSource(cotoSource, {}, buildHooks());

  assert.ok(run1.inserted > 0);
  assert.strictEqual(run2.inserted, 0, 'coto idempotent on re-run');
  assert.strictEqual(run2.updated, run1.inserted);
});

// =============================================================================
// Jumbo — end-to-end + idempotency
// =============================================================================

test('runner: jumbo source runs end-to-end and achieves 0-insert idempotency on re-run', async () => {
  const fx = await loadExtract('jumbo', 'descuentos-del-dia');
  const md = await loadMd('jumbo', 'descuentos-del-dia');

  const dbByUrl = new Map<string, PersistedPromoMeta>();
  const dbById = new Set<string>();

  const jumboSource: Source = {
    id: JUMBO_SOURCE_ID,
    kind: 'bulk',
    async listUrls() {
      return [fx.source_url];
    },
    async extract(url, scrape) {
      const r = await extractJumboPromos({
        source_url: url,
        markdown: scrape.markdown,
        llmOverride: async () => ({ data: { promos: fx.promos as any }, usage: usage() }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  };

  const buildHooks = () => ({
    scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
    existingByUrlOverride: dbByUrl,
    upsertOverride: async (args: { id: string; promo: any; rawHtmlHash: string }) => {
      const action: 'inserted' | 'updated' = dbById.has(args.id) ? 'updated' : 'inserted';
      dbById.add(args.id);
      dbByUrl.set(args.promo.source_url, {
        id: args.id,
        source_id: JUMBO_SOURCE_ID,
        source_url: args.promo.source_url,
        raw_html_hash: args.rawHtmlHash,
        last_seen_at: new Date(),
      });
      return action;
    },
    markSeenOverride: async () => {},
    runLoggerOverride: {
      start: async () => 'run-jumbo',
      finish: async () => {},
    },
  });

  const run1 = await runSource(jumboSource, {}, buildHooks());
  const run2 = await runSource(jumboSource, {}, buildHooks());

  assert.ok(run1.inserted > 0);
  assert.strictEqual(run2.inserted, 0, 'jumbo idempotent on re-run');
});

// =============================================================================
// P0 reinforcement: carrefour idempotency under SIMULATED Gemini drift.
// Same runner setup, but the second run's LLM stub drifts the pct by floats
// and duplicates valid_day entries. The Phase-3.3 flake shape — now fixed.
// =============================================================================

test('runner (P0): carrefour idempotent EVEN WHEN Gemini drifts pct / valid_days between runs', async () => {
  const fx = await loadExtract('carrefour', 'descuentos-bancarios');
  const md = await loadMd('carrefour', 'descuentos-bancarios');

  const dbByUrl = new Map<string, PersistedPromoMeta>();
  const dbById = new Set<string>();

  const sourceFactory = (promos: any[]): Source => ({
    id: CARREFOUR_SOURCE_ID,
    kind: 'bulk',
    async listUrls() {
      return [fx.source_url];
    },
    async extract(url, scrape) {
      const cleaned = cleanCarrefourMarkdown(scrape.markdown);
      const r = await extractCarrefourPromos({
        source_url: url,
        markdown: cleaned,
        llmOverride: async () => ({ data: { promos: promos as any }, usage: usage() }),
      });
      return { promos: r.promos, ids: r.ids, cost_usd: 0 };
    },
  });

  const buildHooks = () => ({
    scrapeOverride: async () => ({ markdown: md, rawHtml: null, creditsUsed: 1 }),
    existingByUrlOverride: dbByUrl,
    upsertOverride: async (args: { id: string; promo: any; rawHtmlHash: string }) => {
      const action: 'inserted' | 'updated' = dbById.has(args.id) ? 'updated' : 'inserted';
      dbById.add(args.id);
      dbByUrl.set(args.promo.source_url, {
        id: args.id,
        source_id: CARREFOUR_SOURCE_ID,
        source_url: args.promo.source_url,
        raw_html_hash: args.rawHtmlHash,
        last_seen_at: new Date(),
      });
      return action;
    },
    markSeenOverride: async () => {},
    runLoggerOverride: {
      start: async () => 'run-carrefour-drift',
      finish: async () => {},
    },
  });

  // Run 1: canonical payload.
  const run1 = await runSource(sourceFactory(fx.promos), {}, buildHooks());
  assert.ok(run1.inserted > 0);

  // Run 2: drifted payload — floats + duplicated days + uppercase banks.
  const drifted = fx.promos.map((p: any) => {
    const c: any = { ...p };
    if (typeof c.pct === 'number' && c.pct !== 0) c.pct = c.pct + 0.0000001;
    if (Array.isArray(c.valid_days) && c.valid_days.length > 0) {
      c.valid_days = [...c.valid_days, c.valid_days[0]];
    }
    if (Array.isArray(c.issuer_bank)) {
      c.issuer_bank = c.issuer_bank.map((b: string) => b.toUpperCase());
    }
    return c;
  });
  const run2 = await runSource(sourceFactory(drifted), {}, buildHooks());

  assert.strictEqual(
    run2.inserted,
    0,
    `P0: drifted re-run must insert 0, got ${run2.inserted}`,
  );
  assert.strictEqual(run2.updated, run1.inserted);
});

// =============================================================================
// Dry-run CLI path: adapter must be compatible with --dry-run (no scrape, no
// upsert, no scrape_runs writes).
// =============================================================================

test('runner: carrefour dry-run does not scrape, upsert, or log runs', async () => {
  const fx = await loadExtract('carrefour', 'descuentos-bancarios');
  const { createCarrefourSource } = await import('../ingestion/carrefour-source.js');
  const src = createCarrefourSource({ urlOverride: fx.source_url });

  let scrapes = 0,
    upserts = 0,
    starts = 0,
    finishes = 0;

  const rollup = await runSource(
    src,
    { dryRun: true },
    {
      scrapeOverride: async () => {
        scrapes += 1;
        return { markdown: 'md', rawHtml: null, creditsUsed: 1 };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => {
        upserts += 1;
        return 'inserted';
      },
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => {
          starts += 1;
          return 'unused';
        },
        finish: async () => {
          finishes += 1;
        },
      },
    },
  );

  assert.strictEqual(rollup.dry_run, true);
  assert.strictEqual(scrapes, 0);
  assert.strictEqual(upserts, 0);
  assert.strictEqual(starts, 0);
  assert.strictEqual(finishes, 0);
  assert.strictEqual(rollup.url_count, 1);
});

test('runner: coto dry-run lists both default URLs without scraping', async () => {
  const { createCotoSource, COTO_DEFAULT_URLS } = await import('../ingestion/coto-source.js');
  const src = createCotoSource();

  let scrapes = 0;
  const rollup = await runSource(
    src,
    { dryRun: true },
    {
      scrapeOverride: async () => {
        scrapes += 1;
        return { markdown: 'md', rawHtml: null, creditsUsed: null };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'unused',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.dry_run, true);
  assert.strictEqual(scrapes, 0);
  assert.strictEqual(rollup.url_count, COTO_DEFAULT_URLS.length);
});

test('runner: jumbo dry-run lists both default URLs without scraping', async () => {
  const { createJumboSource, JUMBO_DEFAULT_URLS } = await import('../ingestion/jumbo-source.js');
  const src = createJumboSource();

  let scrapes = 0;
  const rollup = await runSource(
    src,
    { dryRun: true },
    {
      scrapeOverride: async () => {
        scrapes += 1;
        return { markdown: 'md', rawHtml: null, creditsUsed: null };
      },
      existingByUrlOverride: new Map(),
      upsertOverride: async () => 'inserted',
      markSeenOverride: async () => {},
      runLoggerOverride: {
        start: async () => 'unused',
        finish: async () => {},
      },
    },
  );

  assert.strictEqual(rollup.dry_run, true);
  assert.strictEqual(scrapes, 0);
  assert.strictEqual(rollup.url_count, JUMBO_DEFAULT_URLS.length);
});
