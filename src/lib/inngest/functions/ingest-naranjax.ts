// Scheduled Naranja X ingestion.
import { buildIngestFunction } from './build-ingest-function';
import { SOURCE_SCHEDULES } from '../schedules';
import { runNaranjaxIngestion } from '../../../../scripts/ingestion/naranjax-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-naranjax');
if (!schedule) throw new Error('ingest-naranjax schedule entry missing from SOURCE_SCHEDULES');

export const ingestNaranjax = buildIngestFunction(schedule, () => runNaranjaxIngestion());
