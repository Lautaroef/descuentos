// Shared Postgres client for CLI scripts.
// Singleton so multiple imports in one process share a connection pool.
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';

// Load .env.local from the repo root (this file lives in scripts/lib/).
// We load .env.local explicitly because dotenv's auto-config only reads `.env`.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env.local') });
loadEnv({ path: resolve(__dirname, '..', '..', '.env'), override: false });

let client: Sql | null = null;

export function getDb(): Sql {
  if (client) return client;

  // Connection-string priority:
  //   1. DATABASE_POOLER_URL — Supabase transaction-mode pooler (IPv4-compatible).
  //      MUST be used from Vercel because Vercel's serverless network is IPv4-only
  //      and Supabase's direct `db.<ref>.supabase.co` host resolves IPv6-only.
  //      Connecting to the direct URL from Vercel hangs until the function timeout
  //      — that was the 2026-04 silent-cron-failure root cause.
  //   2. DATABASE_URL — direct connection. Fine from local CLI runs. Falls back
  //      here when no pooler URL is present.
  const url = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_POOLER_URL or DATABASE_URL must be set. Populate .env.local (see .env.example) before running DB scripts.',
    );
  }

  client = postgres(url, {
    // Conservative defaults for short-lived CLI scripts.
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase-compatible; harmless for direct Postgres connections.
    prepare: false,
  });

  return client;
}

export async function close(): Promise<void> {
  if (!client) return;
  await client.end({ timeout: 5 });
  client = null;
}
