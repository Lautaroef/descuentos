// Schedule configuration tests.
//
// These guard two classes of regression:
//   1. Cron-expression drift — someone changes a schedule without updating the
//      corresponding `expected_cadence_minutes`, and staleness alerts fire
//      (or stop firing) for the wrong reason.
//   2. Source coverage gaps — the SOURCE_SCHEDULES array drifts out of sync
//      with the set of live ingestion sources. A new source ships without a
//      cron trigger; the app goes silently stale again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HEALTH_CHECK_CRON,
  SOURCE_SCHEDULES,
} from '../../src/lib/inngest/schedules.js';

// Known set of source_ids that must have a scheduled ingestion. Adding a
// source_id to this list forces a new schedule entry — that's the whole point.
const REQUIRED_SOURCE_IDS = [
  'modo',
  'cuenta-dni',
  'brubank',
  'naranjax',
  'uala',
  'personalpay',
  'coto-descuentos',
  'jumbo-descuentos',
  'carrefour-descuentos-bancarios',
] as const;

test('every required source has exactly one schedule entry', () => {
  for (const required of REQUIRED_SOURCE_IDS) {
    const matches = SOURCE_SCHEDULES.filter((s) => s.source_id === required);
    assert.equal(
      matches.length,
      1,
      `expected exactly 1 schedule for source_id=${required}, got ${matches.length}`,
    );
  }
});

test('function_ids are unique', () => {
  const seen = new Set<string>();
  for (const s of SOURCE_SCHEDULES) {
    assert.ok(!seen.has(s.function_id), `duplicate function_id: ${s.function_id}`);
    seen.add(s.function_id);
  }
});

test('every cron expression includes TZ=America/Argentina/Buenos_Aires', () => {
  for (const s of SOURCE_SCHEDULES) {
    assert.match(
      s.cron,
      /^TZ=America\/Argentina\/Buenos_Aires /,
      `${s.function_id}: cron must be ART-prefixed, got "${s.cron}"`,
    );
  }
  assert.match(HEALTH_CHECK_CRON, /^TZ=America\/Argentina\/Buenos_Aires /);
});

test('expected_cadence_minutes matches the cron frequency', () => {
  // Simple sanity: a weekly cron (single day-of-week) should report 10080 min.
  // A bi-monthly cron (1,15 * *) should report 21600 min (half of a 30-day month).
  // Daily or other cadences aren't in use yet — extend when they are.
  const WEEKLY = 7 * 24 * 60;
  const BIWEEKLY = 15 * 24 * 60;

  for (const s of SOURCE_SCHEDULES) {
    // Parse the 5-field cron (after the TZ= prefix).
    const fields = s.cron.split(' ').slice(1); // drop TZ prefix
    const [, , dom, , dow] = fields;

    if (dow !== '*' && dom === '*') {
      // Day-of-week only → weekly (we only use single-day-of-week crons).
      assert.equal(
        s.expected_cadence_minutes,
        WEEKLY,
        `${s.function_id}: dow="${dow}" implies WEEKLY cadence`,
      );
    } else if (dom.includes(',') && dow === '*') {
      // e.g. "1,15" → twice monthly → treat as 15-day cadence.
      assert.equal(
        s.expected_cadence_minutes,
        BIWEEKLY,
        `${s.function_id}: dom="${dom}" implies BIWEEKLY cadence`,
      );
    }
  }
});

test('health-check cron is daily', () => {
  // Expect minute=0, hour=9, all other fields `*`.
  const fields = HEALTH_CHECK_CRON.split(' ').slice(1);
  assert.deepEqual(fields, ['0', '9', '*', '*', '*']);
});
