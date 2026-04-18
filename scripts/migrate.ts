// Minimal forward-only migration runner.
// - Scans db/migrations/*.sql in lexicographic order.
// - Applies each unseen file inside a transaction.
// - Records applied names in _migrations so reruns are idempotent.
// - Fails loudly with migration name + SQL error on any failure.
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, close } from './lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'db', 'migrations');

async function main(): Promise<void> {
  const sql = getDb();

  await sql`
    create table if not exists _migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set<string>(
    (await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migrations found in', MIGRATIONS_DIR);
    return;
  }

  let applied_count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}  (already applied)`);
      continue;
    }

    const fullPath = join(MIGRATIONS_DIR, file);
    const body = readFileSync(fullPath, 'utf8');
    console.log(`  apply ${file}`);

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into _migrations (name) values (${file})`;
      });
      applied_count += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n✗ Migration ${file} failed:\n${message}\n`);
      throw err;
    }
  }

  console.log(
    `\n✓ Migrations done (${applied_count} applied, ${files.length - applied_count} skipped).`,
  );
}

main()
  .then(async () => {
    await close();
    process.exit(0);
  })
  .catch(async (err) => {
    await close().catch(() => {});
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
