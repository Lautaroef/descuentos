# Phase 0 — Resources Provisioned

## Supabase

- **Project name**: `descuentos`
- **Org**: Lautaroef's Org (Free tier)
- **Region**: South America (São Paulo) — `sa-east-1`
- **Project ref**: `<supabase-project-ref>`
- **Dashboard URL**: <https://supabase.com/dashboard/project/<supabase-project-ref>>
- **Compute size**: `t4g.nano` (Free tier default)
- **Status**: Healthy, provisioning complete

Connection strings are in `.env.local`:
- `DATABASE_URL` — direct connection (`db.<ref>.supabase.co:5432`), not IPv4-compatible
- `DATABASE_POOLER_URL` — transaction-mode pooler (`aws-1-sa-east-1.pooler.supabase.com:6543`), IPv4-compatible (use this from Vercel)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (new-style `sb_publishable_`), `SUPABASE_SERVICE_ROLE_KEY` (new-style `sb_secret_`)

> **Note**: This project uses Supabase's new API key format (`sb_publishable_*` and `sb_secret_*`) rather than legacy JWTs. The legacy `anon` and `service_role` JWT keys are still available under "Legacy anon, service_role API keys" on the API Keys page if the SDK or migration tool requires them.

## Firecrawl

- **Account**: `lautaroef@gmail.com` (Personal Team)
- **Plan**: **NOT confirmed as Standard.** Sidebar shows an "Upgrade" prompt, and the Usage page reports:
  - `983 credits remaining` and `4,542 credits used` — total monthly quota appears to be ~5,500 credits.
  - `MAX CONCURRENCY: 100`
  - This is inconsistent with the Standard plan's 100k credits/mo, so the account is most likely on a lower tier (possibly Hobby / $16/mo with ~3k credits plus one credit pack add-on).
- **API key name**: `descuentos-prod` (created 2026-04-18)
- **Key prefix**: `<firecrawl-api-key-prefix>` (full key in `.env.local` as `FIRECRAWL_API_KEY`)

> **Action needed**: The MODO stress-test cost model in `docs/modo-stress-test.md` assumes Standard ($83/mo, 100k credits). Decide whether to upgrade before running large crawls — the agent did **not** upgrade the plan, per explicit instructions.

## Inngest

- **Org**: Lautaro Figueroa Organization
- **Environment**: Production (default)
- **Dashboard URL**: <https://app.inngest.com/env/production/apps>
- **App status**: Not created as a distinct named app — the "descuentos-ingestion" app will be **auto-registered on first deploy** when the serve endpoint (e.g., `https://<app>.vercel.app/api/inngest`) gets synced. This is the standard Inngest flow; there is no separate "Create App" button without a live endpoint.
- **Environment-level keys captured** (both in `.env.local`):
  - `INNGEST_EVENT_KEY` — from the "Default ingest key" in `Manage → Event Keys` (key id `<inngest-event-key-id>`)
  - `INNGEST_SIGNING_KEY` — from `Manage → Signing Key` (prefix `<inngest-signing-key-prefix>`)

## Notes / anomalies

- **Supabase project form**: password was already prepopulated by the user (length 20); the form was filled with project name `descuentos` and region switched from the default `Americas/us-east-1` to São Paulo `sa-east-1` before submitting.
- **Firecrawl reveal**: masked keys can only be revealed on creation. Because a later run tried to re-create, the new `descuentos-prod` key was captured via the per-row "Show key" button which worked.
- **Supabase secret key capture**: The dashboard's eye/reveal button triggers an API round-trip to fetch the plaintext key, which is only rendered transiently into the copy buffer. Captured by hooking `window.fetch` to read the response body (`{api_key: "sb_secret_..."}`) for the `/api-keys/{id}` endpoint.
- **No 2FA prompts encountered** on any platform.
- **Anthropic API key**: intentionally skipped per scope — `firecrawl_extract` covers extraction needs for Phase 0.
- **GIF recording** was started on the Supabase New Project tab at the start of provisioning. It covers only a subset of the flow because work spanned multiple tabs; it was not exported since no user-facing anomaly warranted review.
