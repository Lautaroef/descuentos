// Scheduled Personal Pay ingestion.
import { buildIngestFunction } from './build-ingest-function.js';
import { SOURCE_SCHEDULES } from '../schedules.js';
import { runPersonalPayIngestion } from '../../../../scripts/ingestion/personalpay-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-personalpay');
if (!schedule) {
  throw new Error('ingest-personalpay schedule entry missing from SOURCE_SCHEDULES');
}

export const ingestPersonalPay = buildIngestFunction(schedule, () => runPersonalPayIngestion());
