// CLI entry for the Phase 3.3 Coto ingest.
//   pnpm run-coto --dry-run
//   pnpm run-coto --limit=1
//   pnpm run-coto --url=https://www.coto.com.ar/descuentos/
//   pnpm run-coto --url=https://www.cotodigital.com.ar/sitios/cdigi/descuentos --url=https://www.coto.com.ar/descuentos/
import { close } from './lib/db.js';
import { runCotoIngestion } from './ingestion/coto-run.js';

function parseFlags(argv: string[]): {
  dryRun: boolean;
  limit?: number;
  urls?: string[];
  concurrency: number;
} {
  let dryRun = false;
  let limit: number | undefined;
  const urls: string[] = [];
  let concurrency = 3;
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      limit = Number(arg.slice('--limit='.length));
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
    } else if (arg.startsWith('--url=')) {
      const u = arg.slice('--url='.length).trim();
      if (!u) throw new Error('Empty --url value');
      urls.push(u);
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = Number(arg.slice('--concurrency='.length));
      if (!Number.isFinite(concurrency) || concurrency <= 0) {
        throw new Error(`Invalid --concurrency value: ${arg}`);
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return {
    dryRun,
    limit,
    urls: urls.length > 0 ? urls : undefined,
    concurrency,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(
    `[coto] starting ingest (dryRun=${flags.dryRun}${flags.limit ? ` limit=${flags.limit}` : ''}${flags.urls ? ` urls=${flags.urls.join(',')}` : ''})`,
  );

  const t0 = Date.now();
  const rollup = await runCotoIngestion(flags);
  const elapsed_s = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n============================================================');
  console.log('COTO INGEST SUMMARY');
  console.log('============================================================');
  console.log(`URLs processed:       ${rollup.url_count}`);
  console.log(`Promos inserted:      ${rollup.inserted}`);
  console.log(`Promos updated:       ${rollup.updated}`);
  console.log(`URLs unchanged:       ${rollup.unchanged}`);
  console.log(`Errored:              ${rollup.errored}`);
  console.log(`Total Gemini cost:    $${rollup.total_cost_usd.toFixed(4)}`);
  console.log(`Firecrawl credits:    ${rollup.total_firecrawl_credits ?? 'n/a'}`);
  console.log(`Thoughts-token warn:  ${rollup.thoughts_token_warnings}`);
  console.log(`Elapsed:              ${elapsed_s}s`);
  console.log(`Run ID:               ${rollup.run_id ?? '(dry-run)'}`);

  if (rollup.errored > 0) {
    console.log('\nErrors:');
    for (const r of rollup.results.filter((x) => x.action === 'errored')) {
      console.log(`  ${r.url}: ${r.error}`);
    }
  }
}

main()
  .then(async () => {
    await close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n✗ Run failed:', err instanceof Error ? err.stack : err);
    await close().catch(() => {});
    process.exit(1);
  });
