// MODO orchestrator — thin wrapper around the generic `runSource()`.
//
// All the logic that used to live here (hub fetch, slug-diff, hash-compare skip,
// upsert, scrape_runs rollup) now lives in scripts/lib/source-runner.ts. This file
// just builds the MODO `Source` adapter, passes the options through, and formats
// the summary in the shape scripts/run-modo.ts expects.
//
// Behaviour is identical to Phase 1: same concurrency default (3), same dry-run
// semantics, same --slug=<slug> debug mode, same scrape_runs row shape.
import { createModoSource, MODO_SOURCE_ID } from './modo-source.js';
import { runSource, type RunRollup as GenericRollup } from '../lib/source-runner.js';
import { getThoughtsTokenWarnings } from '../lib/gemini.js';
import { fetchModoHubSlugs, type HubResult } from './modo-hub.js';

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
  results: GenericRollup['results'];
  dry_run: boolean;
}

export async function runModoIngestion(options: RunOptions = {}): Promise<RunRollup> {
  const { dryRun = false, limit, concurrency = 3, slug } = options;

  // Single-slug debug mode: skip the hub. `createModoSource` will surface one URL.
  if (slug) {
    const source = createModoSource({ slugOverride: slug });
    const rollup = await runSource(source, { dryRun, limit, concurrency });
    return toModoRollup(rollup, null);
  }

  // Default path: fetch the hub ourselves so we can report its stats (the UI summary
  // in scripts/run-modo.ts prints hub markdown length + content hash). The source
  // adapter's listUrls() would repeat the hub fetch; instead we inject the slug
  // list by building a source with slug-overrides-via-factory. But runSource needs
  // one listUrls() call — so we build a source that reuses the hub result below.
  let hub: HubResult | null = null;
  if (!dryRun || limit !== undefined || true) {
    // We always want the hub stats in the summary, including for dry-run.
    hub = await fetchModoHubSlugs();
    console.log(
      `[modo] hub returned ${hub.slugs.length} slugs (md=${hub.markdown_length} chars, credits=${hub.credits_used ?? 'n/a'})`,
    );
    for (const [section, slugs] of Object.entries(hub.sections)) {
      console.log(`  - ${section}: ${slugs.length} slugs`);
    }
  }

  // Build a source that returns the prefetched slug list. Keeps behaviour identical
  // to Phase 1: one hub call per run, not two.
  const prefetchedSource = {
    ...createModoSource(),
    listUrls: async () => (hub ? hub.slugs.map((s) => `https://www.modo.com.ar/promos/${s}`) : []),
  };

  const rollup = await runSource(prefetchedSource, { dryRun, limit, concurrency });

  // Thin reshape so scripts/run-modo.ts's summary printer keeps working unchanged.
  return toModoRollup(rollup, hub);
}

function toModoRollup(rollup: GenericRollup, hub: HubResult | null): RunRollup {
  // If the hub fetch was done here, surface its credits on top of per-URL credits.
  let total_firecrawl_credits = rollup.total_firecrawl_credits;
  if (hub && typeof hub.credits_used === 'number') {
    total_firecrawl_credits = (total_firecrawl_credits ?? 0) + hub.credits_used;
  }

  return {
    run_id: rollup.run_id,
    hub: hub
      ? {
          slugs: hub.slugs,
          raw_markdown_hash: hub.raw_markdown_hash,
          markdown_length: hub.markdown_length,
          credits_used: hub.credits_used,
        }
      : null,
    inserted: rollup.inserted,
    updated: rollup.updated,
    unchanged: rollup.unchanged,
    errored: rollup.errored,
    total_cost_usd: rollup.total_cost_usd,
    total_firecrawl_credits,
    thoughts_token_warnings: getThoughtsTokenWarnings(),
    results: rollup.results,
    dry_run: rollup.dry_run,
  };
}

// Re-export the source id for scripts that want to reference it.
export { MODO_SOURCE_ID };
