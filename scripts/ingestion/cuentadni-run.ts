// Cuenta DNI orchestrator — thin wrapper around the generic runner.
import { createCuentaDniSource } from './cuentadni-source.js';
import { runSource, type RunRollup } from '../lib/source-runner.js';

export interface CuentaDniRunOptions {
  dryRun?: boolean;
  concurrency?: number;
  /** Override discovery with an explicit article URL. */
  article?: string;
}

export async function runCuentaDniIngestion(
  options: CuentaDniRunOptions = {},
): Promise<RunRollup> {
  const { dryRun = false, concurrency = 3, article } = options;
  const source = createCuentaDniSource({ articleOverride: article });
  return runSource(source, { dryRun, concurrency });
}
