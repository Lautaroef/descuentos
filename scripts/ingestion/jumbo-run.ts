// Jumbo orchestrator — thin wrapper around the generic runner.
import { createJumboSource } from './jumbo-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface JumboRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  limit?: number;
  urls?: string[];
}

export async function runJumboIngestion(options: JumboRunOptions = {}): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, limit, urls } = options;
  const source = createJumboSource({ urlOverride: urls });
  return runSource(source, { dryRun, concurrency, limit });
}
