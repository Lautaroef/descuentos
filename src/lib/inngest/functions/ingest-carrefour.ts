// Scheduled Carrefour ingestion.
import { buildIngestFunction } from './build-ingest-function.js';
import { SOURCE_SCHEDULES } from '../schedules.js';
import { runCarrefourIngestion } from '../../../../scripts/ingestion/carrefour-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-carrefour');
if (!schedule) throw new Error('ingest-carrefour schedule entry missing from SOURCE_SCHEDULES');

export const ingestCarrefour = buildIngestFunction(schedule, () => runCarrefourIngestion());
