// Post-migration sanity check: connects, confirms schema objects exist,
// and reports source-seed counts. Exits non-zero on any failure.
// Never prints secrets — if postgres-js surfaces them in an error string, redact before logging.
import 'dotenv/config';
import { getDb, close } from './lib/db.js';

function redact(message: string): string {
  // Strip postgres:// credentials if the driver ever echoes the URL in an error.
  return message.replace(
    /postgres(?:ql)?:\/\/[^:]+:[^@]+@/gi,
    'postgres://***:***@',
  );
}

async function main(): Promise<void> {
  const sql = getDb();

  // 1. Basic connectivity.
  const [{ ok }] = await sql<{ ok: number }[]>`select 1 as ok`;
  if (ok !== 1) throw new Error('SELECT 1 returned unexpected value');
  console.log('✓ connected');

  // 2. sources table exists and is seeded.
  const [{ count: sources_count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from sources
  `;
  if (sources_count === 0) {
    throw new Error('sources table is empty — did you run `pnpm migrate`?');
  }
  console.log(`✓ ${sources_count} sources seeded`);

  // 3. scrape_runs table is reachable (may be empty; that's expected pre-Phase 1).
  const [{ count: runs_count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from scrape_runs
  `;
  console.log(`✓ scrape_runs table ready (${runs_count} rows)`);

  // 4. promos table exists — check the information_schema rather than counting, so
  //    an empty pre-ingestion table still passes.
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'promos'
    ) as exists
  `;
  if (!exists) throw new Error('promos table missing');
  console.log('✓ promos table ready');

  console.log('\nSmoke test passed.');
}

main()
  .then(async () => {
    await close();
    process.exit(0);
  })
  .catch(async (err) => {
    await close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Smoke test failed: ${redact(message)}`);
    process.exit(1);
  });
