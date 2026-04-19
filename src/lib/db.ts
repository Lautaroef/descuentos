// Postgres singleton for the Next.js app.
//
// We deliberately do NOT re-export from `scripts/lib/db.ts` — that module lives outside
// the Next build boundary (it loads `dotenv` + reads `.env.local` relative to its own path,
// which breaks under Vercel's tracing). Instead we keep a thin, Next-friendly client here
// that picks the best connection URL for the runtime (pooler in production, direct locally).
import 'server-only';
import postgres, { type Sql } from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __descuentos_pg__: Sql | undefined;
}

/**
 * Resolve the Postgres connection string.
 *
 * Prefer `DATABASE_POOLER_URL` on Vercel (transaction-mode pooler, safe for serverless).
 * Fall back to `DATABASE_URL` (direct connection) for local `next dev` and for CLI scripts
 * that need session features the pooler disallows.
 */
function resolveConnectionUrl(): string {
  const preferPooler = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const pooler = process.env.DATABASE_POOLER_URL;
  const direct = process.env.DATABASE_URL;
  const url = preferPooler ? pooler ?? direct : direct ?? pooler;
  if (!url) {
    throw new Error(
      'DATABASE_URL (or DATABASE_POOLER_URL) is not set. Check your Vercel project env vars or local .env.local.',
    );
  }
  return url;
}

export function getDb(): Sql {
  if (globalThis.__descuentos_pg__) return globalThis.__descuentos_pg__;

  const client = postgres(resolveConnectionUrl(), {
    // Conservative: Vercel serverless functions are short-lived. One or two connections each.
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase pooler (pgbouncer in transaction mode) can't handle prepared statements.
    prepare: false,
  });

  globalThis.__descuentos_pg__ = client;
  return client;
}
