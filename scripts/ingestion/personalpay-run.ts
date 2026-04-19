// Personal Pay orchestrator.
import { createPersonalPaySource } from './personalpay-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface PersonalPayRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  url?: string;
}

export async function runPersonalPayIngestion(
  options: PersonalPayRunOptions = {},
): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, url } = options;
  const source = createPersonalPaySource({ urlOverride: url });
  return runSource(source, { dryRun, concurrency });
}
