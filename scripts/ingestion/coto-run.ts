// Coto orchestrator — thin wrapper around the generic runner.
import { createCotoSource } from './coto-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface CotoRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  limit?: number;
  /** Override the default URL list with one or more URLs (e.g., `--url=...`). */
  urls?: string[];
}

export async function runCotoIngestion(options: CotoRunOptions = {}): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, limit, urls } = options;
  const source = createCotoSource({ urlOverride: urls });
  return runSource(source, { dryRun, concurrency, limit });
}
