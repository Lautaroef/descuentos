// CLI entry for the Phase 1 MODO ingest.
//   pnpm run-modo --dry-run
//   pnpm run-modo --limit=3
//   pnpm run-modo --slug=coto-mar26
//   pnpm run-modo --concurrency=4
import { close } from './lib/db.js';
import { runModoIngestion } from './ingestion/modo-run.js';

function parseFlags(argv: string[]): {
  dryRun: boolean;
  limit?: number;
  slug?: string;
  concurrency: number;
} {
  let dryRun = false;
  let limit: number | undefined;
  let slug: string | undefined;
  let concurrency = 3;
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      limit = Number(arg.slice('--limit='.length));
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
    } else if (arg.startsWith('--slug=')) {
      slug = arg.slice('--slug='.length).trim();
      if (!slug) throw new Error('Empty --slug value');
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = Number(arg.slice('--concurrency='.length));
      if (!Number.isFinite(concurrency) || concurrency <= 0) {
        throw new Error(`Invalid --concurrency value: ${arg}`);
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return { dryRun, limit, slug, concurrency };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`[modo] starting ingest (dryRun=${flags.dryRun}${flags.limit ? ` limit=${flags.limit}` : ''}${flags.slug ? ` slug=${flags.slug}` : ''})`);

  const t0 = Date.now();
  const rollup = await runModoIngestion(flags);
  const elapsed_s = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n============================================================');
  console.log('MODO INGEST SUMMARY');
  console.log('============================================================');
  if (rollup.hub) {
    console.log(`Hub slugs:            ${rollup.hub.slugs.length}`);
    console.log(`Hub markdown length:  ${rollup.hub.markdown_length} chars`);
    console.log(`Hub content hash:     ${rollup.hub.raw_markdown_hash.slice(0, 16)}...`);
  }
  console.log(`Inserted:             ${rollup.inserted}`);
  console.log(`Updated:              ${rollup.updated}`);
  console.log(`Unchanged:            ${rollup.unchanged}`);
  console.log(`Errored:              ${rollup.errored}`);
  console.log(`Total Gemini cost:    $${rollup.total_cost_usd.toFixed(4)}`);
  console.log(
    `Firecrawl credits:    ${rollup.total_firecrawl_credits ?? 'n/a'}`,
  );
  console.log(`Thoughts-token warn:  ${rollup.thoughts_token_warnings}`);
  console.log(`Elapsed:              ${elapsed_s}s`);
  console.log(`Run ID:               ${rollup.run_id ?? '(dry-run)'}`);

  if (rollup.errored > 0) {
    console.log('\nErrors:');
    for (const r of rollup.results.filter((x) => x.action === 'errored')) {
      console.log(`  ${r.slug}: ${r.error}`);
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
