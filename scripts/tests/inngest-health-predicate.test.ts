// Unit tests for the staleness predicate.
//
// These are the correctness tests for the classifier at the heart of the
// health-check. We drive it with fabricated ScrapeRunSummary maps so the logic
// is exercised without a DB — fast, deterministic, runs in CI forever.
//
// Edge cases we cover:
//   - never-run source          → `missing`
//   - last row has an error     → `errored`
//   - last run succeeded w/ 0   → `empty`
//   - last success within 2×    → OK (no alert)
//   - last success just over 2× → `stale`
//   - boundary: exactly 2×      → OK (strict greater-than is the threshold)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findStaleSources,
  type ScrapeRunSummary,
  type SourceConfig,
} from '../../src/lib/inngest/health-predicate.js';

const MODO: SourceConfig = { source_id: 'modo', expected_cadence_minutes: 7 * 24 * 60 };
const now = new Date('2026-04-25T12:00:00Z'); // Arbitrary Saturday.

function summary(overrides: Partial<ScrapeRunSummary>): ScrapeRunSummary {
  return {
    source_id: 'modo',
    last_finished_at: null,
    last_success_at: null,
    last_promo_count: null,
    last_error: null,
    ...overrides,
  };
}

test('flags a source that has never run as `missing`', () => {
  const stale = findStaleSources({
    now,
    sources: [MODO],
    summaries: new Map(),
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reason, 'missing');
  assert.equal(stale[0].source_id, 'modo');
});

test('flags a source whose last run has a non-null error as `errored`', () => {
  const stale = findStaleSources({
    now,
    sources: [MODO],
    summaries: new Map([
      [
        'modo',
        summary({
          last_finished_at: new Date(now.getTime() - 60_000),
          last_success_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
          last_promo_count: 0,
          last_error: 'firecrawl: 502 bad gateway',
        }),
      ],
    ]),
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reason, 'errored');
  assert.equal(stale[0].last_error, 'firecrawl: 502 bad gateway');
});

test('flags a source whose last successful run returned 0 promos as `empty`', () => {
  const stale = findStaleSources({
    now,
    sources: [MODO],
    summaries: new Map([
      [
        'modo',
        summary({
          last_finished_at: new Date(now.getTime() - 60_000),
          last_success_at: new Date(now.getTime() - 60_000),
          last_promo_count: 0,
          last_error: null,
        }),
      ],
    ]),
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reason, 'empty');
  assert.equal(stale[0].last_promo_count, 0);
});

test('does NOT flag a source whose last success is within 2× cadence', () => {
  // 7-day cadence, last success 13 days ago — within 2× (14 days). OK.
  const stale = findStaleSources({
    now,
    sources: [MODO],
    summaries: new Map([
      [
        'modo',
        summary({
          last_finished_at: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
          last_success_at: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
          last_promo_count: 42,
          last_error: null,
        }),
      ],
    ]),
  });
  assert.equal(stale.length, 0);
});

test('flags a source whose last success is older than 2× cadence as `stale`', () => {
  // 15 days ago > 2× 7-day cadence → stale.
  const stale = findStaleSources({
    now,
    sources: [MODO],
    summaries: new Map([
      [
        'modo',
        summary({
          last_finished_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
          last_success_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
          last_promo_count: 40,
          last_error: null,
        }),
      ],
    ]),
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reason, 'stale');
  assert.ok(stale[0].stale_minutes! >= 15 * 24 * 60);
});

test('boundary: exactly 2× cadence is NOT stale (strict greater-than)', () => {
  const stale = findStaleSources({
    now,
    sources: [MODO],
    summaries: new Map([
      [
        'modo',
        summary({
          last_finished_at: new Date(now.getTime() - 2 * MODO.expected_cadence_minutes * 60_000),
          last_success_at: new Date(now.getTime() - 2 * MODO.expected_cadence_minutes * 60_000),
          last_promo_count: 10,
          last_error: null,
        }),
      ],
    ]),
  });
  assert.equal(stale.length, 0);
});

test('classifies multiple sources independently', () => {
  const BRUBANK: SourceConfig = {
    source_id: 'brubank',
    expected_cadence_minutes: 7 * 24 * 60,
  };
  const stale = findStaleSources({
    now,
    sources: [MODO, BRUBANK],
    summaries: new Map([
      // MODO is fine.
      [
        'modo',
        summary({
          last_finished_at: new Date(now.getTime() - 60_000),
          last_success_at: new Date(now.getTime() - 60_000),
          last_promo_count: 42,
        }),
      ],
      // Brubank errored.
      [
        'brubank',
        summary({
          source_id: 'brubank',
          last_finished_at: new Date(now.getTime() - 60_000),
          last_success_at: null,
          last_promo_count: null,
          last_error: 'postgres: connection refused',
        }),
      ],
    ]),
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].source_id, 'brubank');
  // The predicate still classifies "ran but never succeeded + has an error" via
  // the errored branch (we hit the error check before the missing-success branch).
  assert.equal(stale[0].reason, 'errored');
});
