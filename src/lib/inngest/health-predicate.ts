// Pure staleness predicate for the health-check scheduled function.
//
// Split out into its own module (no `server-only`, no DB, no webhook) so unit
// tests can run it without booting anything else. The Inngest function imports
// this AND a Postgres query; tests drive it with in-memory rows.
//
// A source is "healthy" if ALL of:
//   - it has at least one successful `scrape_runs` row (finished_at non-null, no error)
//   - its most recent successful run is within `expected_cadence_minutes * 2` of now
//   - its most recent run (success or failure) does not have a non-null error
//   - its most recent run's promo_count > 0 (empty results are a red flag)
//
// We use 2x the expected cadence as the stale threshold so a single skipped week
// on a weekly source doesn't alert. The alert fires only when a source has
// genuinely fallen behind its schedule.
import type { StaleSourceAlert } from '../alerts.js';

export interface ScrapeRunSummary {
  source_id: string;
  /** Most recent `scrape_runs.finished_at` across all rows (null = still running or crashed). */
  last_finished_at: Date | null;
  /** Most recent successful finished_at (error IS NULL). */
  last_success_at: Date | null;
  /** promo_count from the most recent finished run. */
  last_promo_count: number | null;
  /** error from the most recent run, if any. */
  last_error: string | null;
}

export interface SourceConfig {
  source_id: string;
  /** Expected cadence in minutes. Sources whose cadence is "as often as", e.g. 10080 = 1 week. */
  expected_cadence_minutes: number;
}

export interface HealthCheckInput {
  /** Current wall-clock time (injected for determinism in tests). */
  now: Date;
  /** Per-source config pulled from the DB / the cron definitions. */
  sources: SourceConfig[];
  /** Most-recent scrape_runs summary per source. May be missing entries for never-run sources. */
  summaries: Map<string, ScrapeRunSummary>;
}

/**
 * Classify every configured source. Returns one StaleSourceAlert per source that
 * fails at least one health check. Ordering is stable: same input → same output.
 */
export function findStaleSources(input: HealthCheckInput): StaleSourceAlert[] {
  const out: StaleSourceAlert[] = [];
  const staleFactor = 2; // Alert when last_success older than 2× expected cadence.

  for (const cfg of input.sources) {
    const summary = input.summaries.get(cfg.source_id);

    // Never run.
    if (!summary || !summary.last_finished_at) {
      out.push({
        source_id: cfg.source_id,
        reason: 'missing',
        last_success_at: null,
        stale_minutes: null,
        expected_cadence_minutes: cfg.expected_cadence_minutes,
        last_promo_count: null,
        last_error: null,
      });
      continue;
    }

    // Errored on the most recent attempt.
    if (summary.last_error) {
      out.push({
        source_id: cfg.source_id,
        reason: 'errored',
        last_success_at: summary.last_success_at?.toISOString() ?? null,
        stale_minutes: summary.last_success_at
          ? Math.round((input.now.getTime() - summary.last_success_at.getTime()) / 60_000)
          : null,
        expected_cadence_minutes: cfg.expected_cadence_minutes,
        last_promo_count: summary.last_promo_count,
        last_error: summary.last_error,
      });
      continue;
    }

    // Stale: most recent success older than 2x cadence.
    if (summary.last_success_at) {
      const staleMinutes =
        (input.now.getTime() - summary.last_success_at.getTime()) / 60_000;
      if (staleMinutes > cfg.expected_cadence_minutes * staleFactor) {
        out.push({
          source_id: cfg.source_id,
          reason: 'stale',
          last_success_at: summary.last_success_at.toISOString(),
          stale_minutes: Math.round(staleMinutes),
          expected_cadence_minutes: cfg.expected_cadence_minutes,
          last_promo_count: summary.last_promo_count,
          last_error: null,
        });
        continue;
      }
    } else {
      // Finished runs exist but none ever succeeded — treat as `missing` semantically.
      out.push({
        source_id: cfg.source_id,
        reason: 'missing',
        last_success_at: null,
        stale_minutes: null,
        expected_cadence_minutes: cfg.expected_cadence_minutes,
        last_promo_count: summary.last_promo_count,
        last_error: summary.last_error,
      });
      continue;
    }

    // Empty result from last run (successful but promo_count=0).
    if (summary.last_promo_count === 0) {
      out.push({
        source_id: cfg.source_id,
        reason: 'empty',
        last_success_at: summary.last_success_at.toISOString(),
        stale_minutes: Math.round(
          (input.now.getTime() - summary.last_success_at.getTime()) / 60_000,
        ),
        expected_cadence_minutes: cfg.expected_cadence_minutes,
        last_promo_count: 0,
        last_error: null,
      });
    }
  }

  return out;
}
