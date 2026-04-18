// End-to-end MODO orchestrator: hub → per-slug extract (with slug-diff + hash skip) →
// `scrape_runs` rollup. Called by scripts/run-modo.ts.
//
// Phase 1 scope: runs synchronously in one process. Phase 2 will wire this behind an
// Inngest step-function. Do not add retry / fan-out / concurrency knobs that belong
// in Inngest — keep this callable from a plain Node CLI.
import { fetchModoHubSlugs, type HubResult } from './modo-hub.js';
import { ingestModoSlug, loadExistingMetaIndex, type IngestResult } from './modo-detail.js';
import { finishRun, startRun } from '../lib/scrape-runs.js';
import { getThoughtsTokenWarnings } from '../lib/gemini.js';

export interface RunOptions {
  dryRun?: boolean;
  limit?: number;
  concurrency?: number;
  /** Explicit single-slug mode: skip the hub, go straight to this slug. */
  slug?: string;
}

export interface RunRollup {
  run_id: string | null;
  hub: Pick<HubResult, 'slugs' | 'raw_markdown_hash' | 'markdown_length' | 'credits_used'> | null;
  inserted: number;
  updated: number;
  unchanged: number;
  errored: number;
  total_cost_usd: number;
  total_firecrawl_credits: number | null;
  thoughts_token_warnings: number;
  results: IngestResult[];
  dry_run: boolean;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
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

export async function runModoIngestion(options: RunOptions = {}): Promise<RunRollup> {
  const { dryRun = false, limit, concurrency = 3 } = options;

  // Single-slug debug mode — skip the hub entirely.
  if (options.slug) {
    const existing = await loadExistingMetaIndex();
    const run_id = dryRun ? null : await startRun('modo');
    const res = await ingestModoSlug(options.slug, existing);
    const rollup = summarize([res], null, run_id, dryRun);
    if (run_id && !dryRun) {
      await finishRun(run_id, {
        promo_count: rollup.inserted + rollup.updated + rollup.unchanged,
        schema_valid: rollup.errored === 0,
        raw_html_hash: null,
        error: rollup.errored > 0 ? JSON.stringify(rollup.results.filter((r) => r.action === 'errored')) : null,
      });
    }
    return rollup;
  }

  const run_id = dryRun ? null : await startRun('modo');

  let hub: HubResult;
  try {
    hub = await fetchModoHubSlugs();
  } catch (err: any) {
    if (run_id) {
      await finishRun(run_id, {
        promo_count: 0,
        schema_valid: false,
        raw_html_hash: null,
        error: `hub_fetch: ${err?.message ?? String(err)}`,
      });
    }
    throw err;
  }

  console.log(
    `[modo] hub returned ${hub.slugs.length} slugs (md=${hub.markdown_length} chars, credits=${hub.credits_used ?? 'n/a'})`,
  );
  for (const [section, slugs] of Object.entries(hub.sections)) {
    console.log(`  - ${section}: ${slugs.length} slugs`);
  }

  const targets = typeof limit === 'number' ? hub.slugs.slice(0, limit) : hub.slugs;

  if (dryRun) {
    console.log(`[modo] DRY RUN — would extract ${targets.length} slug(s):`);
    for (const s of targets) console.log(`  ${s}`);
    return summarize([], hub, null, true);
  }

  const existing = await loadExistingMetaIndex();
  console.log(`[modo] ${existing.size} previously-seen promo(s) loaded from DB`);

  const results = await runPool(targets, concurrency, async (slug, idx) => {
    console.log(`[modo] (${idx + 1}/${targets.length}) ingesting ${slug}`);
    const r = await ingestModoSlug(slug, existing);
    console.log(
      `  -> ${r.action}${r.cost_usd !== undefined ? ` cost=$${r.cost_usd.toFixed(4)}` : ''}${
        r.error ? ` error=${r.error}` : ''
      }${r.valid_days_from_rawhtml ? ' [valid_days from rawHtml]' : ''}${
        r.dates_from_vigencia ? ' [dates from Vigencia]' : ''
      }`,
    );
    return r;
  });

  const rollup = summarize(results, hub, run_id, false);
  const erroredDetails = results.filter((r) => r.action === 'errored').map((r) => `${r.slug}: ${r.error}`);
  await finishRun(run_id!, {
    promo_count: rollup.inserted + rollup.updated + rollup.unchanged,
    schema_valid: rollup.errored === 0,
    raw_html_hash: hub.raw_markdown_hash,
    error: erroredDetails.length ? erroredDetails.join(' | ') : null,
  });

  return rollup;
}

function summarize(
  results: IngestResult[],
  hub: HubResult | null,
  run_id: string | null,
  dry_run: boolean,
): RunRollup {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let errored = 0;
  let total_cost_usd = 0;
  let total_firecrawl_credits = 0;
  let creditsSeen = false;
  for (const r of results) {
    if (r.action === 'inserted') inserted += 1;
    else if (r.action === 'updated') updated += 1;
    else if (r.action === 'unchanged') unchanged += 1;
    else if (r.action === 'errored') errored += 1;
    if (typeof r.cost_usd === 'number') total_cost_usd += r.cost_usd;
    if (typeof r.credits_used === 'number') {
      total_firecrawl_credits += r.credits_used;
      creditsSeen = true;
    }
  }
  if (hub && typeof hub.credits_used === 'number') {
    total_firecrawl_credits += hub.credits_used;
    creditsSeen = true;
  }
  return {
    run_id,
    hub: hub
      ? {
          slugs: hub.slugs,
          raw_markdown_hash: hub.raw_markdown_hash,
          markdown_length: hub.markdown_length,
          credits_used: hub.credits_used,
        }
      : null,
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
