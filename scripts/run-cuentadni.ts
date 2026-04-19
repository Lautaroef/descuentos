// CLI entry for the Phase 3.1 Cuenta DNI ingest.
//   pnpm run-cuentadni --dry-run
//   pnpm run-cuentadni --article=https://www.ambito.com/...
//   pnpm run-cuentadni --concurrency=3
import { close } from './lib/db.js';
import { runCuentaDniIngestion } from './ingestion/cuentadni-run.js';

function parseFlags(argv: string[]): {
  dryRun: boolean;
  concurrency: number;
  article?: string;
} {
  let dryRun = false;
  let concurrency = 3;
  let article: string | undefined;
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true;
    } else if (arg.startsWith('--article=')) {
      article = arg.slice('--article='.length).trim();
      if (!article) throw new Error('Empty --article value');
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = Number(arg.slice('--concurrency='.length));
      if (!Number.isFinite(concurrency) || concurrency <= 0) {
        throw new Error(`Invalid --concurrency value: ${arg}`);
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return { dryRun, concurrency, article };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(
    `[cuenta-dni] starting ingest (dryRun=${flags.dryRun}${flags.article ? ` article=${flags.article}` : ''})`,
  );

  const t0 = Date.now();
  const rollup = await runCuentaDniIngestion(flags);
  const elapsed_s = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n============================================================');
  console.log('CUENTA DNI INGEST SUMMARY');
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
