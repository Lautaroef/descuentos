// Scheduled Ualá ingestion.
import { buildIngestFunction } from './build-ingest-function';
import { SOURCE_SCHEDULES } from '../schedules';
import { runUalaIngestion } from '../../../../scripts/ingestion/uala-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-uala');
if (!schedule) throw new Error('ingest-uala schedule entry missing from SOURCE_SCHEDULES');

export const ingestUala = buildIngestFunction(schedule, () => runUalaIngestion());
