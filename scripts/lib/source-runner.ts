// Generic source runner.
//
// Given a `Source` implementation, this runner:
//   1. Starts a `scrape_runs` row (unless dry-run).
//   2. Calls `source.listUrls()` to enumerate work.
//   3. For each URL: scrape with Firecrawl, hash-compare against the last-stored
//      `raw_html_hash` for that source_url, decide skip-or-extract, upsert the
//      resulting Promo(s) with TTL.
//   4. Finishes the `scrape_runs` row with a rollup summary.
//
// The hash-compare skip only fires for `kind === 'per-url'` sources. For `bulk`
// sources (one press article → many promos) we intentionally re-extract on every
// run — reasoning documented at the skip-decision site below.
//
// Concurrency defaults to 3 (inherited from MODO Phase 1). Per-source tuning is
// out of scope for Phase 3 — add it only when a real source needs it.
import { createHash } from 'node:crypto';
import { scrapePage } from './firecrawl.js';
import { finishRun, startRun } from './scrape-runs.js';
import {
  listPromoSlugsForSource,
  markPromoSeen,
  upsertPromo,
  type PersistedPromoMeta,
} from './promo-repo.js';
import type { Source } from './source.js';
import { getThoughtsTokenWarnings } from './gemini.js';

export type IngestAction = 'inserted' | 'updated' | 'unchanged' | 'errored';

export interface UrlResult {
  url: string;
  action: IngestAction;
  /** When `bulk`: 'inserted'/'updated' counts per-promo; this is the dominant action. */
  promo_actions?: Record<'inserted' | 'updated', number>;
  error?: string;
  cost_usd?: number;
  credits_used?: number | null;
  overrides?: Array<Record<string, boolean>>;
}

export interface RunOptions {
  dryRun?: boolean;
  limit?: number;
  concurrency?: number;
}

export interface RunRollup {
  source_id: string;
  run_id: string | null;
  url_count: number;
  inserted: number;
  updated: number;
  unchanged: number;
  errored: number;
  total_cost_usd: number;
  total_firecrawl_credits: number | null;
  thoughts_token_warnings: number;
  results: UrlResult[];
  dry_run: boolean;
}

// =============================================================================
// Test-only seam.
//
// The MODO adapter takes an `llmOverride` for offline-fixture testing. At the
// runner level we accept a different kind of override: a `scrapeOverride` that
// stubs Firecrawl, and a pre-loaded `existingByUrl` map that skips the DB read.
// This keeps the runner itself testable offline without pulling in a fake DB.
// =============================================================================
export interface RunnerTestHooks {
  scrapeOverride?: (url: string) => Promise<{
    markdown: string | null;
    rawHtml: string | null;
    creditsUsed: number | null;
  }>;
  existingByUrlOverride?: Map<string, PersistedPromoMeta>;
  /** Stub the upsertPromo call. Returns the action that should be reported. */
  upsertOverride?: (args: {
    id: string;
    promo: import('../promo-schema.js').Promo;
    rawHtmlHash: string;
  }) => Promise<'inserted' | 'updated'>;
  /** Stub the scrape_runs writer. */
  runLoggerOverride?: {
    start?: (source_id: string) => Promise<string>;
    finish?: (
      run_id: string,
      args: { promo_count: number; schema_valid: boolean; raw_html_hash: string | null; error?: string | null },
    ) => Promise<void>;
  };
  /** Stub markPromoSeen. */
  markSeenOverride?: (source_id: string, source_url: string) => Promise<void>;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function hashMarkdown(md: string): string {
  return createHash('sha256').update(md, 'utf8').digest('hex');
}

/**
 * Run a single source end-to-end.
 *
 * The generic shape is deliberate: every Phase 3 source shares upsert-with-TTL +
 * scrape_runs + hash-compare semantics. Per-source logic lives in the adapter's
 * `listUrls()` and `extract()` — NOT here.
 */
export async function runSource(
  source: Source,
  options: RunOptions = {},
  hooks: RunnerTestHooks = {},
): Promise<RunRollup> {
  const { dryRun = false, limit, concurrency = 3 } = options;

  const startRunFn = hooks.runLoggerOverride?.start ?? startRun;
  const finishRunFn = hooks.runLoggerOverride?.finish ?? finishRun;
  const run_id = dryRun ? null : await startRunFn(source.id);

  let urls: string[];
  try {
    urls = await source.listUrls();
  } catch (err: any) {
    if (run_id) {
      await finishRunFn(run_id, {
        promo_count: 0,
        schema_valid: false,
        raw_html_hash: null,
        error: `list_urls: ${err?.message ?? String(err)}`,
      });
    }
    throw err;
  }

  const targets = typeof limit === 'number' ? urls.slice(0, limit) : urls;

  console.log(`[${source.id}] listing returned ${urls.length} url(s); processing ${targets.length}`);

  if (dryRun) {
    console.log(`[${source.id}] DRY RUN — would extract ${targets.length} url(s):`);
    for (const u of targets) console.log(`  ${u}`);
    return summarize(source.id, [], run_id, true, targets.length);
  }

  // Load the existing-meta index so we can hash-compare for per-url sources.
  const existing =
    hooks.existingByUrlOverride ??
    new Map((await listPromoSlugsForSource(source.id)).map((r) => [r.source_url, r]));
  console.log(`[${source.id}] ${existing.size} previously-seen promo(s) loaded from DB`);

  const scrapeFn = hooks.scrapeOverride ?? (async (u: string) => {
    const r = await scrapePage(u, {
      formats: source.scrapeOptions?.formats ?? ['markdown', 'rawHtml'],
      onlyMainContent: source.scrapeOptions?.onlyMainContent ?? true,
      waitFor: source.scrapeOptions?.waitFor ?? 5000,
    });
    return { markdown: r.markdown, rawHtml: r.rawHtml, creditsUsed: r.creditsUsed };
  });

  const upsertFn = hooks.upsertOverride ?? upsertPromo;
  const markSeenFn = hooks.markSeenOverride ?? markPromoSeen;

  const results = await runPool(targets, concurrency, async (url, idx) => {
    console.log(`[${source.id}] (${idx + 1}/${targets.length}) scraping ${url}`);
    return await ingestUrl({
      source,
      url,
      existingByUrl: existing,
      scrapeFn,
      upsertFn,
      markSeenFn,
    });
  });

  const rollup = summarize(source.id, results, run_id, false, targets.length);
  const erroredDetails = results.filter((r) => r.action === 'errored').map((r) => `${r.url}: ${r.error}`);
  await finishRunFn(run_id!, {
    promo_count: rollup.inserted + rollup.updated + rollup.unchanged,
    schema_valid: rollup.errored === 0,
    raw_html_hash: null,
    error: erroredDetails.length ? erroredDetails.join(' | ') : null,
  });

  return rollup;
}

interface IngestUrlArgs {
  source: Source;
  url: string;
  existingByUrl: Map<string, PersistedPromoMeta>;
  scrapeFn: (url: string) => Promise<{ markdown: string | null; rawHtml: string | null; creditsUsed: number | null }>;
  upsertFn: (args: { id: string; promo: import('../promo-schema.js').Promo; rawHtmlHash: string }) => Promise<'inserted' | 'updated'>;
  markSeenFn: (source_id: string, source_url: string) => Promise<void>;
}

async function ingestUrl(args: IngestUrlArgs): Promise<UrlResult> {
  const { source, url, existingByUrl, scrapeFn, upsertFn, markSeenFn } = args;

  let scraped;
  try {
    scraped = await scrapeFn(url);
  } catch (err: any) {
    return { url, action: 'errored', error: `scrape: ${err?.message ?? String(err)}` };
  }

  const markdown = scraped.markdown ?? '';
  if (!markdown) {
    return { url, action: 'errored', error: 'empty markdown from scrape' };
  }

  const hash = hashMarkdown(markdown);

  // Hash-compare skip decision.
  //
  // For `per-url` sources: a cached row keyed by exactly this URL represents the
  // canonical Promo for this content. Hash match → content unchanged → skip.
  //
  // For `bulk` sources: one URL → many Promos. The cached row only reflects ONE
  // of the N promos (whichever got upserted last), so a hash match doesn't prove
  // all N promos are unchanged. We always re-extract. The upsert path is
  // idempotent (same (source_id, source_url) → same row ids → UPDATE), so the
  // policy is safe at the cost of one Gemini call per run.
  if (source.kind === 'per-url') {
    const existing = existingByUrl.get(url);
    if (existing && existing.raw_html_hash === hash) {
      await markSeenFn(source.id, url);
      return { url, action: 'unchanged', credits_used: scraped.creditsUsed };
    }
  }

  let out;
  try {
    out = await source.extract(url, { markdown, rawHtml: scraped.rawHtml });
  } catch (err: any) {
    return { url, action: 'errored', error: `extract: ${err?.message ?? String(err)}` };
  }

  if (out.promos.length !== out.ids.length) {
    return {
      url,
      action: 'errored',
      error: `extract: promos.length (${out.promos.length}) != ids.length (${out.ids.length})`,
    };
  }

  const promoActions: Record<'inserted' | 'updated', number> = { inserted: 0, updated: 0 };
  try {
    for (let i = 0; i < out.promos.length; i += 1) {
      const action = await upsertFn({ id: out.ids[i], promo: out.promos[i], rawHtmlHash: hash });
      promoActions[action] += 1;
    }
  } catch (err: any) {
    return { url, action: 'errored', error: `upsert: ${err?.message ?? String(err)}` };
  }

  // Collapse to a single dominant action for the URL-level rollup.
  const action: IngestAction = promoActions.inserted > 0 ? 'inserted' : 'updated';

  return {
    url,
    action,
    promo_actions: promoActions,
    cost_usd: out.cost_usd,
    credits_used: scraped.creditsUsed,
    overrides: out.overrides,
  };
}

function summarize(
  source_id: string,
  results: UrlResult[],
  run_id: string | null,
  dry_run: boolean,
  url_count: number,
): RunRollup {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let errored = 0;
  let total_cost_usd = 0;
  let total_firecrawl_credits = 0;
  let creditsSeen = false;

  for (const r of results) {
    if (r.action === 'unchanged') unchanged += 1;
    else if (r.action === 'errored') errored += 1;
    else if (r.promo_actions) {
      inserted += r.promo_actions.inserted;
      updated += r.promo_actions.updated;
    } else if (r.action === 'inserted') inserted += 1;
    else if (r.action === 'updated') updated += 1;

    if (typeof r.cost_usd === 'number') total_cost_usd += r.cost_usd;
    if (typeof r.credits_used === 'number') {
      total_firecrawl_credits += r.credits_used;
      creditsSeen = true;
    }
  }

  return {
    source_id,
    run_id,
    url_count,
    inserted,
    updated,
    unchanged,
    errored,
    total_cost_usd: Math.round(total_cost_usd * 10_000) / 10_000,
    total_firecrawl_credits: creditsSeen ? total_firecrawl_credits : null,
    thoughts_token_warnings: getThoughtsTokenWarnings(),
    results,
    dry_run,
  };
}
