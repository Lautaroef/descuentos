// Tests for alert formatting + webhook delivery.
//
// Pure string-shape tests for the Discord/Slack payload formatter, plus one
// integration-level test that drives `sendHealthAlert` with a stubbed fetch so
// we cover:
//   - no webhook URL set → logs but returns delivered:false (ship-without-webhook contract)
//   - webhook OK → returns delivered:true
//   - webhook returns 400 → returns delivered:false (does not throw)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatHealthCheckMessage,
  sendHealthAlert,
  type HealthCheckSummary,
  type StaleSourceAlert,
} from '../../src/lib/alerts.js';

function summary(stale: StaleSourceAlert[]): HealthCheckSummary {
  return {
    checked_at: '2026-04-25T12:00:00Z',
    total_sources: 9,
    stale_sources: stale,
  };
}

test('all-healthy summary renders a single OK line', () => {
  const msg = formatHealthCheckMessage(summary([]));
  assert.equal(
    msg,
    '[descuentos-ar health] OK — 9 fuentes al día (chequeado 2026-04-25T12:00:00Z)',
  );
});

test('stale source renders with hour-granularity since last success', () => {
  const msg = formatHealthCheckMessage(
    summary([
      {
        source_id: 'modo',
        reason: 'stale',
        last_success_at: '2026-04-10T00:00:00Z',
        stale_minutes: 20 * 24 * 60, // 20 days
        expected_cadence_minutes: 7 * 24 * 60,
        last_promo_count: 40,
        last_error: null,
      },
    ]),
  );
  assert.match(msg, /1\/9 fuentes con problemas/);
  assert.match(msg, /modo: última corrida exitosa hace 480\.0h/); // 20 * 24 = 480
  assert.match(msg, /cadencia esperada: 168h/); // 7 * 24 = 168
});

test('empty source renders the zero-promo-count line', () => {
  const msg = formatHealthCheckMessage(
    summary([
      {
        source_id: 'coto-descuentos',
        reason: 'empty',
        last_success_at: '2026-04-25T05:00:00Z',
        stale_minutes: 60,
        expected_cadence_minutes: 7 * 24 * 60,
        last_promo_count: 0,
        last_error: null,
      },
    ]),
  );
  assert.match(msg, /coto-descuentos: última corrida devolvió 0 promos/);
});

test('errored source renders the error message inline', () => {
  const msg = formatHealthCheckMessage(
    summary([
      {
        source_id: 'brubank',
        reason: 'errored',
        last_success_at: '2026-04-20T00:00:00Z',
        stale_minutes: null,
        expected_cadence_minutes: 7 * 24 * 60,
        last_promo_count: null,
        last_error: 'firecrawl: 502 upstream',
      },
    ]),
  );
  assert.match(msg, /brubank: última corrida con error — firecrawl: 502 upstream/);
});

test('missing source renders a dedicated never-ran line', () => {
  const msg = formatHealthCheckMessage(
    summary([
      {
        source_id: 'uala',
        reason: 'missing',
        last_success_at: null,
        stale_minutes: null,
        expected_cadence_minutes: 7 * 24 * 60,
        last_promo_count: null,
        last_error: null,
      },
    ]),
  );
  assert.match(msg, /uala: sin corridas registradas/);
});

test('sendHealthAlert is a no-op when webhook URL is unset', async () => {
  const res = await sendHealthAlert(summary([]), { webhookUrl: null });
  assert.deepEqual(res, { delivered: false });
});

test('sendHealthAlert POSTs to the webhook when URL is set', async () => {
  let called = 0;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    called += 1;
    assert.equal(url, 'https://example.invalid/webhook');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['content-type'], 'application/json');
    assert.ok(init?.body);
    const body = JSON.parse(String(init.body));
    assert.ok(body.content);
    assert.match(body.content, /descuentos-ar health/);
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;

  const res = await sendHealthAlert(summary([]), {
    webhookUrl: 'https://example.invalid/webhook',
    fetchImpl: fakeFetch,
  });
  assert.equal(called, 1);
  assert.equal(res.delivered, true);
  assert.equal(res.status, 200);
});

test('sendHealthAlert does NOT throw when the webhook returns non-2xx', async () => {
  const fakeFetch = (async () =>
    new Response('bad request', { status: 400 })) as unknown as typeof fetch;
  const res = await sendHealthAlert(summary([]), {
    webhookUrl: 'https://example.invalid/webhook',
    fetchImpl: fakeFetch,
  });
  assert.equal(res.delivered, false);
  assert.equal(res.status, 400);
});
