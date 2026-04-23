// Scheduled Cuenta DNI ingestion (press-article extraction).
import { buildIngestFunction } from './build-ingest-function';
import { SOURCE_SCHEDULES } from '../schedules';
import { runCuentaDniIngestion } from '../../../../scripts/ingestion/cuentadni-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-cuentadni');
if (!schedule) {
  throw new Error('ingest-cuentadni schedule entry missing from SOURCE_SCHEDULES');
}

export const ingestCuentaDni = buildIngestFunction(schedule, () => runCuentaDniIngestion());
