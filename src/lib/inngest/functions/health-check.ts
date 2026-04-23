// Scheduled health check — runs daily at 09:00 ART.
//
// Responsibilities:
//   1. Query `scrape_runs` for the latest finished row per source (success or fail).
//   2. Classify each source against its expected cadence (see schedules.ts).
//   3. Send a summary to the alert webhook if any source is stale/errored/empty.
//
// Design notes:
//   - The staleness predicate (`findStaleSources`) is in a pure module so unit
//     tests can cover the edge cases (missing/stale/empty/errored) without
//     touching a database.
//   - The webhook sender (`sendHealthAlert`) is a no-op when ALERT_WEBHOOK_URL is
//     unset — it logs the summary to stdout so the Inngest dashboard still shows
//     the outcome. This matches the "ship without a webhook" requirement in the
//     spec.
//   - We INCLUDE a non-stale run in the summary too: sending a daily "all fine"
//     heartbeat is how you notice the health-check itself has silently stopped
//     running. Low-volume enough for Discord; one line.
//
// The DB client here is `scripts/lib/db.ts` (not src/lib/db.ts) because the
// health-check function is executed in the same Node environment as the CLI
// runners — it should reuse the exact client the rest of ingestion uses.
import { inngest } from '../client.js';
import { HEALTH_CHECK_CRON, SOURCE_SCHEDULES } from '../schedules.js';
import {
  findStaleSources,
  type ScrapeRunSummary,
  type SourceConfig,
} from '../health-predicate.js';
import { sendHealthAlert } from '../../alerts.js';
import { getDb } from '../../../../scripts/lib/db.js';

/**
 * Most-recent scrape run per source_id. We compute two timestamps in one query:
 *   - `last_finished_at` — most recent row that finished (success or fail)
 *   - `last_success_at`  — most recent row that finished AND has no error
 * This lets the predicate distinguish "ran but errored" from "stale".
 */
async function loadLatestRunsBySource(): Promise<Map<string, ScrapeRunSummary>> {
  const sql = getDb();
  const rows = await sql<
    Array<{
      source_id: string;
      last_finished_at: Date | null;
      last_success_at: Date | null;
      last_promo_count: number | null;
      last_error: string | null;
    }>
  >`
    with ranked as (
      select
        source_id,
        finished_at,
        promo_count,
        error,
        row_number() over (
          partition by source_id
          order by coalesce(finished_at, started_at) desc
        ) as rn
      from scrape_runs
      where finished_at is not null
    ),
    latest_any as (
      select source_id, finished_at, promo_count, error
      from ranked where rn = 1
    ),
    latest_success as (
      select distinct on (source_id) source_id, finished_at
      from scrape_runs
      where finished_at is not null and error is null
      order by source_id, finished_at desc
    )
    select
      la.source_id,
      la.finished_at       as last_finished_at,
      ls.finished_at       as last_success_at,
      la.promo_count       as last_promo_count,
      la.error             as last_error
    from latest_any la
    left join latest_success ls using (source_id)
  `;

  const map = new Map<string, ScrapeRunSummary>();
  for (const r of rows) {
    map.set(r.source_id, {
      source_id: r.source_id,
      last_finished_at: r.last_finished_at ? new Date(r.last_finished_at) : null,
      last_success_at: r.last_success_at ? new Date(r.last_success_at) : null,
      last_promo_count: r.last_promo_count,
      last_error: r.last_error,
    });
  }
  return map;
}

function sourceConfigsFromSchedules(): SourceConfig[] {
  return SOURCE_SCHEDULES.map((s) => ({
    source_id: s.source_id,
    expected_cadence_minutes: s.expected_cadence_minutes,
  }));
}

export const healthCheck = inngest.createFunction(
  {
    id: 'health-check',
    name: 'Health check — staleness alarm',
    triggers: [{ cron: HEALTH_CHECK_CRON }],
    concurrency: { limit: 1 },
    timeouts: { finish: '5m' },
  },
  async ({ step, logger }) => {
    const summaries = await step.run('load-latest-runs', async () => {
      return Array.from((await loadLatestRunsBySource()).entries());
    });

    const now = new Date();
    const sources = sourceConfigsFromSchedules();
    const summariesMap = new Map<string, ScrapeRunSummary>(
      summaries.map(([id, s]) => [
        id,
        {
          ...s,
          last_finished_at: s.last_finished_at ? new Date(s.last_finished_at) : null,
          last_success_at: s.last_success_at ? new Date(s.last_success_at) : null,
        },
      ]),
    );

    const stale = findStaleSources({ now, sources, summaries: summariesMap });

    logger.info(
      `[health-check] ${sources.length} sources inspected; ${stale.length} flagged`,
    );
    for (const s of stale) {
      logger.warn(`[health-check] ${s.source_id}: ${s.reason}`);
    }

    const summary = {
      checked_at: now.toISOString(),
      total_sources: sources.length,
      stale_sources: stale,
    };

    const delivery = await step.run('send-alert', () => sendHealthAlert(summary));
    logger.info(`[health-check] alert delivery: ${JSON.stringify(delivery)}`);

    return summary;
  },
);
