// Scheduled Jumbo ingestion.
import { buildIngestFunction } from './build-ingest-function';
import { SOURCE_SCHEDULES } from '../schedules';
import { runJumboIngestion } from '../../../../scripts/ingestion/jumbo-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-jumbo');
if (!schedule) throw new Error('ingest-jumbo schedule entry missing from SOURCE_SCHEDULES');

export const ingestJumbo = buildIngestFunction(schedule, () => runJumboIngestion());
