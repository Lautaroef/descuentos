// Inngest client singleton.
//
// This is the durable orchestrator for all scheduled ingestion work. Event/signing
// keys are wired via the INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY env vars — the
// Inngest SDK reads them automatically, but we still pass `eventKey` explicitly so
// that misconfigured deploys fail loudly instead of silently no-oping.
//
// See docs/architecture.md (orchestration) and docs/build-plan.md §1.5 for the
// original design intent.
//
// We deliberately do NOT `import 'server-only'` here. This module is imported by
// our offline node:test suite to inspect function configs — `server-only` would
// throw immediately. The module is still server-only in practice: nothing client-
// side references it, and `postgres`/`inngest` aren't browser-safe anyway.
import { Inngest } from 'inngest';

/**
 * Single Inngest app id. Don't change this — Inngest tracks function history by
 * `<app-id>/<function-id>`; a rename orphans every historical run.
 */
export const INNGEST_APP_ID = 'descuentos-ar';

export const inngest = new Inngest({
  id: INNGEST_APP_ID,
  // `eventKey` is optional in development (where Inngest's Dev Server proxies
  // without auth), but mandatory in production. The SDK falls back to
  // `process.env.INNGEST_EVENT_KEY` when this is undefined.
  eventKey: process.env.INNGEST_EVENT_KEY,
});
