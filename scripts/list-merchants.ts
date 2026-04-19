// One-shot dev script: dump every distinct merchant in the live DB with basic metadata.
// Used to size + plan the logo-resolution strategy. Safe to delete after Job 1 ships.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';

const envRaw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { prepare: false });

async function main() {
  const rows = await sql<{ merchant: string; count: number; cats: string[] }[]>`
    select merchant, count(*)::int as count,
      array_agg(distinct category) as cats
    from promos
    where last_seen_at > now() - interval '30 days'
    group by merchant
    order by count(*) desc, merchant asc
  `;
  console.log('TOTAL DISTINCT MERCHANTS:', rows.length);
  for (const r of rows) {
    console.log(`${r.count}\t${r.merchant}\t${r.cats.join(',')}`);
  }
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
