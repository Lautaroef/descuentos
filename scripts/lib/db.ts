// Shared Postgres client for CLI scripts.
// Singleton so multiple imports in one process share a connection pool.
import 'dotenv/config';
import postgres, { type Sql } from 'postgres';

let client: Sql | null = null;

export function getDb(): Sql {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Populate .env.local (see .env.example) before running DB scripts.',
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
