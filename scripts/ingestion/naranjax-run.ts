// Naranja X orchestrator.
import { createNaranjaxSource } from './naranjax-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface NaranjaxRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  limit?: number;
  /** Override the hub URL list. Useful for debugging a single hub. */
  urls?: string[];
}

export async function runNaranjaxIngestion(
  options: NaranjaxRunOptions = {},
): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, limit, urls } = options;
  const source = createNaranjaxSource({ urlsOverride: urls });
  return runSource(source, { dryRun, concurrency, limit });
}
