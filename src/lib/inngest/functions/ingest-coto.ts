// Scheduled Coto ingestion.
import { buildIngestFunction } from './build-ingest-function.js';
import { SOURCE_SCHEDULES } from '../schedules.js';
import { runCotoIngestion } from '../../../../scripts/ingestion/coto-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-coto');
if (!schedule) throw new Error('ingest-coto schedule entry missing from SOURCE_SCHEDULES');

export const ingestCoto = buildIngestFunction(schedule, () => runCotoIngestion());
