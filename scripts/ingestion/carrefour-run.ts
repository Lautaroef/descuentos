// Carrefour orchestrator — thin wrapper around the generic runner.
import { createCarrefourSource } from './carrefour-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface CarrefourRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  limit?: number;
  /** Override the default URL (e.g., swap in /promociones or a staging URL). */
  url?: string;
}

export async function runCarrefourIngestion(
  options: CarrefourRunOptions = {},
): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, limit, url } = options;
  const source = createCarrefourSource({ urlOverride: url });
  return runSource(source, { dryRun, concurrency, limit });
}
