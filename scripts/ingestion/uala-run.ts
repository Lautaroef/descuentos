// Ualá orchestrator.
import { createUalaSource } from './uala-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface UalaRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  limit?: number;
  /** Single-slug debug mode. */
  slug?: string;
}

export async function runUalaIngestion(
  options: UalaRunOptions = {},
): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, limit, slug } = options;
  const source = createUalaSource({ slugOverride: slug });
  return runSource(source, { dryRun, concurrency, limit });
}
