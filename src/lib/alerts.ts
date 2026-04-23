// Alerting — delivers health-check summaries to a webhook (Discord-compatible).
//
// Design choices:
//   - Webhook URL comes from ALERT_WEBHOOK_URL. If unset, we log to stdout instead
//     of failing — this lets the health-check cron ship without blocking on a real
//     webhook. Add the URL later; no code change needed.
//   - Target format is Discord-compatible (`{ content: string }`). Slack's legacy
//     incoming-webhooks accept the same body shape, so one payload covers both.
//   - Voseo in copy (per docs/design/direction.md brand voice).
//
// No `server-only` import: the offline test suite loads this module to verify
// the message-formatting + webhook logic. The module is still server-side in
// practice (no client component imports it).

/**
 * A single flagged source, as produced by the health-check staleness predicate.
 */
export interface StaleSourceAlert {
  source_id: string;
  /** `stale`: no successful run within expected window. */
  /** `empty`: last run returned promo_count = 0. */
  /** `errored`: last run has a non-null error. */
  /** `missing`: never ran (no scrape_runs rows at all). */
  reason: 'stale' | 'empty' | 'errored' | 'missing';
  /** ISO string. Null when reason === 'missing'. */
  last_success_at: string | null;
  /** Minutes since the last successful run. Null when reason === 'missing'. */
  stale_minutes: number | null;
  /** The cadence threshold we measured staleness against. */
  expected_cadence_minutes: number;
  /** Promo count from the most recent scrape_runs row. */
  last_promo_count: number | null;
  /** Most recent error, if any. */
  last_error: string | null;
}

export interface HealthCheckSummary {
  checked_at: string;
  total_sources: number;
  stale_sources: StaleSourceAlert[];
}

/**
 * Format a health-check summary as a Discord/Slack-compatible message.
 *
 * When there are no stale sources we emit a single green-tick line rather than a
 * long "all good" block — the webhook is meant to be low-noise.
 */
export function formatHealthCheckMessage(summary: HealthCheckSummary): string {
  const { total_sources, stale_sources, checked_at } = summary;

  if (stale_sources.length === 0) {
    return `[descuentos-ar health] OK — ${total_sources} fuentes al día (chequeado ${checked_at})`;
  }

  const lines: string[] = [];
  lines.push(
    `[descuentos-ar health] ${stale_sources.length}/${total_sources} fuentes con problemas (chequeado ${checked_at}):`,
  );
  for (const s of stale_sources) {
    lines.push(`  - ${formatSourceLine(s)}`);
  }
  return lines.join('\n');
}

function formatSourceLine(s: StaleSourceAlert): string {
  switch (s.reason) {
    case 'missing':
      return `${s.source_id}: sin corridas registradas`;
    case 'stale': {
      const hours = s.stale_minutes != null ? (s.stale_minutes / 60).toFixed(1) : '?';
      const cadenceH = (s.expected_cadence_minutes / 60).toFixed(0);
      return `${s.source_id}: última corrida exitosa hace ${hours}h (cadencia esperada: ${cadenceH}h)`;
    }
    case 'empty':
      return `${s.source_id}: última corrida devolvió 0 promos (last_success_at=${s.last_success_at ?? 'n/a'})`;
    case 'errored':
      return `${s.source_id}: última corrida con error — ${s.last_error ?? 'sin detalle'}`;
  }
}

/**
 * Deliver the summary. When `ALERT_WEBHOOK_URL` is unset we log to stdout and
 * succeed. That's intentional: the scheduled cron must not fail just because a
 * webhook URL hasn't been set up yet.
 *
 * Testable via the `fetchImpl` override. The default uses `globalThis.fetch`.
 */
export async function sendHealthAlert(
  summary: HealthCheckSummary,
  opts: { webhookUrl?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<{ delivered: boolean; status?: number }> {
  const webhookUrl = opts.webhookUrl ?? process.env.ALERT_WEBHOOK_URL ?? null;
  const message = formatHealthCheckMessage(summary);

  if (!webhookUrl) {
    console.log(`[alerts] ALERT_WEBHOOK_URL unset; logging only:\n${message}`);
    return { delivered: false };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });

  if (!res.ok) {
    // Don't throw — the webhook being down must not break the health-check function.
    // We log and return so the Inngest dashboard still shows a green run with a
    // visible warning rather than an all-red failure.
    const text = await res.text().catch(() => '<unreadable>');
    console.error(`[alerts] webhook POST failed: ${res.status} — ${text}`);
    return { delivered: false, status: res.status };
  }

  return { delivered: true, status: res.status };
}
