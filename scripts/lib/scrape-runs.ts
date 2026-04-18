// Per-source SLO logging. Writes to `scrape_runs`.
// See docs/architecture.md §2 "Per-source SLO table".
import { getDb } from './db.js';

export async function startRun(source_id: string): Promise<string> {
  const sql = getDb();
  const [row] = await sql<{ id: string }[]>`
    insert into scrape_runs (source_id, started_at)
    values (${source_id}, now())
    returning id
  `;
  return row.id;
}

export interface FinishRunArgs {
  promo_count: number;
  schema_valid: boolean;
  raw_html_hash: string | null;
  error?: string | null;
}

export async function finishRun(run_id: string, args: FinishRunArgs): Promise<void> {
  const sql = getDb();
  await sql`
    update scrape_runs set
      finished_at = now(),
      promo_count = ${args.promo_count},
      schema_valid = ${args.schema_valid},
      raw_html_hash = ${args.raw_html_hash},
      error = ${args.error ?? null}
    where id = ${run_id}
  `;
}
