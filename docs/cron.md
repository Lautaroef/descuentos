# Cron Orchestration (Phase 1.5 + 1.6)

Inngest-backed scheduled ingestion + daily health check. Shipped 2026-04-25.

This doc is the operator's manual for the cron layer. If ingestion goes dark,
start here.

## Why Inngest (vs. Vercel Cron, GH Actions, node-cron)

- **Inngest**: durable step functions, retries, per-function concurrency limits,
  zero-infra dashboard, free 50k runs/mo. Signing keys already in Vercel env.
  *Picked.*
- **Vercel Cron**: native, but Hobby plan allows daily-only schedules — not
  enough for a weekly-plus-monthly mix. Pro is ~$20/mo just for cron.
- **GitHub Actions**: free, any schedule, but ops lives next to CI and per-run
  observability is DIY.
- **node-cron / self-hosted**: needs a long-lived dyno. Costs > $0.

## Schedules (ART)

| source_id                          | cron (ART)                           | cadence    |
|------------------------------------|--------------------------------------|------------|
| `modo`                             | Mon 04:00                            | weekly     |
| `coto-descuentos`                  | Mon 05:00                            | weekly     |
| `jumbo-descuentos`                 | Mon 05:00                            | weekly     |
| `carrefour-descuentos-bancarios`   | Mon 05:00                            | weekly     |
| `naranjax`                         | Tue 04:00                            | weekly     |
| `uala`                             | Tue 04:00                            | weekly     |
| `brubank`                          | Tue 04:00                            | weekly     |
| `personalpay`                      | Tue 04:00                            | weekly     |
| `cuenta-dni`                       | 1st + 15th of month, 04:00           | biweekly   |
| `health-check` (meta)              | Daily 09:00                          | daily      |

Source of truth: `src/lib/inngest/schedules.ts`. Change the cron there; the
health-check's `expected_cadence_minutes` lives in the same record, so cadence
drift can't happen silently.

## File layout

```
src/app/api/inngest/route.ts        Inngest serve endpoint (webhook from cloud)
src/lib/inngest/client.ts           Inngest client singleton
src/lib/inngest/schedules.ts        Cron table (source of truth)
src/lib/inngest/health-predicate.ts Pure staleness classifier (unit-tested)
src/lib/inngest/functions/
  build-ingest-function.ts          Shared factory — one call per source
  ingest-{modo,coto,jumbo,...}.ts   One file per source; delegates to scripts/ingestion
  health-check.ts                   Daily health check + webhook alert
  index.ts                          Barrel export consumed by the serve route

src/lib/alerts.ts                   Webhook sender (Discord/Slack-compatible)
```

## Cross-tree import trick

The Inngest functions live under `src/` (Next.js bundler mode, extension-less
imports). The source runners they call live under `scripts/` (NodeNext, `.js`
extensions mandatory at every relative import). Webpack's default resolver
can't bridge that. Fix: `config.resolve.extensionAlias['.js'] = ['.ts', '.tsx', '.js']`
in `next.config.ts`. This matches TypeScript's `bundler` resolution and lets
a single `.js` import land on the underlying `.ts` file.

## Health check

**What it checks**, per source:
1. `missing` — no `scrape_runs` rows ever
2. `errored` — most recent run has a non-null `error` column
3. `stale` — most recent successful run is >2× the cadence old
4. `empty` — most recent run succeeded but `promo_count = 0`

Anything flagged is included in the daily message. The "no news" state renders
as a single green-tick line so you still get a heartbeat.

**Alert channel**: `ALERT_WEBHOOK_URL` env. Accepts a Discord webhook URL
(`https://discord.com/api/webhooks/<id>/<token>`) or a Slack incoming webhook
(`https://hooks.slack.com/services/...`). Both accept the `{ content: string }`
payload we send.

**Silent-fail mode**: if `ALERT_WEBHOOK_URL` is unset, we log the summary to
stdout and return `delivered: false`. The health-check function itself stays
green — we don't fail a cron just because a webhook URL isn't set yet.

## Running locally

Point the Inngest Dev Server at `http://localhost:3000/api/inngest`:

```
pnpm dev                                       # in one terminal
npx inngest-cli dev -u http://localhost:3000/api/inngest   # in another
```

The dev server hot-reloads function definitions and lets you trigger runs from
`http://localhost:8288`. No env vars needed for the dev loop.

## Deploy

```bash
vercel --prod
```

Inngest auto-registers on deploy — the first hit to
`https://<your-vercel-url>/api/inngest` from Inngest Cloud fetches the function
list and registers cron triggers. Verify in the Inngest dashboard that:

1. The `descuentos-ar` app is listed
2. All 10 functions are registered (9 ingestion + 1 health-check)
3. Each function's cron schedule matches `schedules.ts`

**Env vars required in production**:
- `INNGEST_EVENT_KEY` — for sending events TO Inngest
- `INNGEST_SIGNING_KEY` — for Inngest to sign webhooks TO us
- `DATABASE_URL` / `DATABASE_POOLER_URL` — used by the runners
- `FIRECRAWL_API_KEY`, `GEMINI_API_KEY` — used by the source extractors
- `ALERT_WEBHOOK_URL` *(optional)* — health-check alerts

## Testing

| File | Purpose |
|---|---|
| `scripts/tests/inngest-schedules.test.ts` | Every required source has a schedule; crons are ART-prefixed; cadence aligns with cron frequency. |
| `scripts/tests/inngest-functions.test.ts` | Every Inngest function has the expected id/trigger/concurrency/timeout. |
| `scripts/tests/inngest-health-predicate.test.ts` | Pure classifier: missing / errored / empty / stale / boundary. |
| `scripts/tests/inngest-alerts.test.ts` | Message formatting; webhook happy path; webhook unset is a no-op; non-2xx doesn't throw. |
| `scripts/tests/inngest-runner-integration.test.ts` | End-to-end runner behaviour: RunRollup contract, per-URL error tolerance, hash-compare skip. |

Run: `pnpm test`.

## Adding a new source

1. Add an entry to `SOURCE_SCHEDULES` in `src/lib/inngest/schedules.ts`.
2. Create `src/lib/inngest/functions/ingest-<source>.ts` following the existing
   pattern (one-liner wrapping the runner).
3. Import it in `src/lib/inngest/functions/index.ts` and add to `ALL_FUNCTIONS`.
4. Add the `source_id` to `REQUIRED_SOURCE_IDS` in
   `scripts/tests/inngest-schedules.test.ts` — the test enforces coverage.
5. `pnpm test` → `pnpm build` → `vercel --prod`. Inngest re-registers on
   deploy.

## What this closes

Root-cause fix for the 2026-04-23 outage (`last_seen_at > 3d` filter hid every
promo because no ingestion had run in 4 days). The gap wasn't a failing scraper
— it was *no orchestration at all*. With Phase 1.5 in place, a missed weekly
cycle is visible within 24h via the health check, long before the UI filter
clamps everything to empty.

## DB keep-alive (Vercel Cron) — added 2026-10-08

Supabase pauses Free-plan projects after ~7 days of low database activity
([docs](https://supabase.com/docs/guides/platform/free-project-pausing)). On
2026-10-08 the project was paused and every page returned 500 (Supavisor:
`tenant/user postgres.<ref> not found`), because the Inngest schedules that used
to generate DB traffic were no longer running.

- `vercel.json` registers a daily Vercel Cron (12:00 UTC; Hobby allows one run
  per day) on `GET /api/keepalive`.
- The route (`src/app/api/keepalive/route.ts`) requires
  `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically; the env
  var is set in Vercel production) and runs `select count(*) from promos`.
- A failed ping returns 503 and logs `[keepalive] database ping failed`, visible
  under Vercel → Logs / Cron Jobs.
- It is independent of Inngest on purpose: if the ingestion scheduler goes dark
  again, the DB still stays awake.
- `src/app/error.tsx` renders a branded, retryable error page if a render
  still fails, instead of the bare Next.js 500 screen.

If the project is paused anyway: Supabase dashboard → project → Resume project
(free), then check `supabase projects list` shows `ACTIVE_HEALTHY`.
