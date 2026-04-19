// Brubank orchestrator — thin wrapper around the generic runner.
import { createBrubankSource } from './brubank-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface BrubankRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  /** Override the `/beneficios` URL (for debugging / staging mirrors). */
  url?: string;
}

export async function runBrubankIngestion(
  options: BrubankRunOptions = {},
): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, url } = options;
  const source = createBrubankSource({ urlOverride: url });
  return runSource(source, { dryRun, concurrency });
}
