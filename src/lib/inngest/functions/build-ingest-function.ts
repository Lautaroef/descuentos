// Shared builder for per-source scheduled ingestion functions.
//
// Every Inngest function we emit for a scheduled ingestion has the SAME shape:
//   - Cron trigger from src/lib/inngest/schedules.ts
//   - concurrency: 1 per source_id (no overlapping runs)
//   - Step-level retry (inherits Inngest's default exponential backoff, 3 tries)
//   - Calls the pre-existing source runner (unchanged)
//   - Returns the rollup summary so the dashboard shows it at a glance
//
// The runner writes to `scrape_runs` itself, so we don't wrap it in `step.run` —
// the source runner's internal error handling already captures per-URL failures
// into the SLO row. If the TOP-LEVEL runner throws (e.g. Postgres down), Inngest
// retries the whole function.
//
// We import the source runners from `scripts/ingestion/*` directly. Next.js's
// bundler resolves `.js` extension imports against TS siblings, so this Just
// Works without `transpilePackages`. The outputFileTracingExcludes in
// next.config.ts was updated to allow scripts/ to be traced into the bundle.
import { inngest } from '../client.js';
import type { SourceSchedule } from '../schedules.js';
import type { RunRollup } from '../../../../scripts/lib/source-runner.js';

type RunnerFn = () => Promise<RunRollup>;

/**
 * Build a scheduled Inngest function that runs one source on its cron.
 *
 * The runner is injected so each per-source file keeps the concrete import
 * visible to the bundler (tree-shaking wouldn't help here since everything is
 * server-side, but explicit imports survive a future refactor better than a
 * registry map).
 */
export function buildIngestFunction(schedule: SourceSchedule, runner: RunnerFn) {
  return inngest.createFunction(
    {
      id: schedule.function_id,
      name: `Ingest ${schedule.display_name}`,
      triggers: [{ cron: schedule.cron }],
      // Hard concurrency limit: one run per source at a time. Prevents a slow
      // run colliding with the next scheduled trigger.
      concurrency: {
        limit: 1,
        key: `"${schedule.source_id}"`,
      },
      // Finish timeout: 15 minutes. The RUN (across all retries + steps) is
      // capped here; an individual step/invocation is capped by Vercel's per-
      // function maxDuration (5 min on Hobby — see src/app/api/inngest/route.ts).
      // Past runs (MODO 40 slugs, Coto 48 promos) finish well under 2 minutes
      // per step, so this leaves headroom for LLM retries + Firecrawl backoff.
      timeouts: { finish: '15m' },
      // Keep the default retry policy (3 attempts, exponential). A scraper
      // that fails once deserves a retry; one that fails three times needs
      // human eyeballs.
    },
    async ({ step, logger, runId }) => {
      logger.info(
        `[${schedule.source_id}] starting cron run (runId=${runId}, cron=${schedule.cron})`,
      );

      // Wrap the runner in step.run so Inngest persists the result for the
      // dashboard. This also means a subsequent retry of the function skips
      // the step if it already succeeded.
      const rollup = await step.run('run-source', async () => {
        const t0 = Date.now();
        const result = await runner();
        const elapsed_s = (Date.now() - t0) / 1000;
        logger.info(
          `[${schedule.source_id}] done in ${elapsed_s.toFixed(1)}s — ` +
            `inserted=${result.inserted} updated=${result.updated} ` +
            `unchanged=${result.unchanged} errored=${result.errored} ` +
            `cost=$${result.total_cost_usd.toFixed(4)}`,
        );
        return result;
      });

      return rollup;
    },
  );
}
