// One-shot: dump distinct issuer_bank strings from the live DB.
// Used to size the WalletPicker "bancos tradicionales" section. Safe to delete.
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
  const rows = await sql<{ bank: string; count: number }[]>`
    select bank, count(*)::int as count
    from promos, unnest(issuer_bank) as bank
    where last_seen_at > now() - interval '30 days'
    group by bank
    order by count(*) desc, bank asc
  `;
  console.log('TOTAL DISTINCT BANKS:', rows.length);
  for (const r of rows) {
    console.log(`${r.count}\t${r.bank}`);
  }
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
