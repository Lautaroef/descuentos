// Scheduled MODO ingestion.
//
// Wraps `runModoIngestion` (which itself wraps the generic runner). The runner
// handles hub fetch → per-slug hash-compare → upsert → scrape_runs rollup.
import { buildIngestFunction } from './build-ingest-function.js';
import { SOURCE_SCHEDULES } from '../schedules.js';
import { runModoIngestion } from '../../../../scripts/ingestion/modo-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-modo');
if (!schedule) throw new Error('ingest-modo schedule entry missing from SOURCE_SCHEDULES');

export const ingestModo = buildIngestFunction(schedule, async () => {
  const rollup = await runModoIngestion();
  // runModoIngestion returns a slightly richer shape (with hub stats); narrow to
  // the generic RunRollup the builder expects.
  return {
    source_id: 'modo',
    run_id: rollup.run_id,
    url_count: rollup.hub?.slugs.length ?? 0,
    inserted: rollup.inserted,
    updated: rollup.updated,
    unchanged: rollup.unchanged,
    errored: rollup.errored,
    total_cost_usd: rollup.total_cost_usd,
    total_firecrawl_credits: rollup.total_firecrawl_credits,
    thoughts_token_warnings: rollup.thoughts_token_warnings,
    results: rollup.results,
    dry_run: rollup.dry_run,
  };
});
