// Inngest function-definition tests.
//
// These run OFFLINE. We construct the same function objects the serve route
// registers and assert their config — id, triggers, concurrency, timeouts —
// without invoking a runner or touching a database.
//
// This is the cron-orchestration counterpart to scripts/tests/modo-extract.test.ts:
// a cheap guard against someone silently breaking a schedule or losing a
// per-source concurrency limit.
//
// Note: these tests deliberately avoid setting INNGEST_SIGNING_KEY. The client
// doesn't verify signing keys at function-construction time; it only does at
// serve time. So we can load the functions without env setup.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_FUNCTIONS,
  ingestModo,
  ingestCuentaDni,
  healthCheck,
} from '../../src/lib/inngest/functions/index.js';
import { SOURCE_SCHEDULES, HEALTH_CHECK_CRON } from '../../src/lib/inngest/schedules.js';

test('ALL_FUNCTIONS contains 9 ingestion functions + 1 health-check', () => {
  assert.equal(ALL_FUNCTIONS.length, SOURCE_SCHEDULES.length + 1);
  assert.equal(SOURCE_SCHEDULES.length, 9, 'expected 9 scheduled ingestion sources');
});

test('every ingestion function has the cron trigger from SOURCE_SCHEDULES', () => {
  for (const schedule of SOURCE_SCHEDULES) {
    const fn = ALL_FUNCTIONS.find((f) => f.opts.id === schedule.function_id);
    assert.ok(fn, `function not registered for id=${schedule.function_id}`);

    const triggers = fn.opts.triggers ?? [];
    assert.equal(triggers.length, 1, `${schedule.function_id} should have exactly one trigger`);
    assert.deepEqual(
      triggers[0],
      { cron: schedule.cron },
      `${schedule.function_id} trigger must match SOURCE_SCHEDULES cron`,
    );
  }
});

test('every ingestion function enforces concurrency: 1 per source_id', () => {
  for (const schedule of SOURCE_SCHEDULES) {
    const fn = ALL_FUNCTIONS.find((f) => f.opts.id === schedule.function_id);
    assert.ok(fn);
    const c = fn.opts.concurrency;
    assert.ok(c, `${schedule.function_id} must declare concurrency`);
    assert.ok(typeof c === 'object' && !Array.isArray(c), 'concurrency must be an object');
    const co = c as { limit: number; key?: string };
    assert.equal(co.limit, 1, `${schedule.function_id} concurrency.limit must be 1`);
    assert.ok(
      co.key && co.key.includes(schedule.source_id),
      `${schedule.function_id} concurrency.key should scope to source_id`,
    );
  }
});

test('health-check function has the daily cron from HEALTH_CHECK_CRON', () => {
  assert.equal(healthCheck.opts.id, 'health-check');
  const triggers = healthCheck.opts.triggers ?? [];
  assert.deepEqual(triggers[0], { cron: HEALTH_CHECK_CRON });
});

test('every function has a finish timeout', () => {
  // A bounded finish time is how we prevent a rogue LLM hang from sitting on
  // a cron slot forever.
  for (const fn of ALL_FUNCTIONS) {
    assert.ok(
      fn.opts.timeouts?.finish,
      `${fn.opts.id} must declare timeouts.finish`,
    );
  }
});

test('ingestModo and ingestCuentaDni are wired through ALL_FUNCTIONS', () => {
  // Spot-check that the barrel re-exports the same instances that land in
  // ALL_FUNCTIONS (not fresh copies with a different identity).
  assert.ok(ALL_FUNCTIONS.includes(ingestModo));
  assert.ok(ALL_FUNCTIONS.includes(ingestCuentaDni));
});
