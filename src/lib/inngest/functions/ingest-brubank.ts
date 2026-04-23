// Scheduled Brubank ingestion.
import { buildIngestFunction } from './build-ingest-function.js';
import { SOURCE_SCHEDULES } from '../schedules.js';
import { runBrubankIngestion } from '../../../../scripts/ingestion/brubank-run.js';

const schedule = SOURCE_SCHEDULES.find((s) => s.function_id === 'ingest-brubank');
if (!schedule) throw new Error('ingest-brubank schedule entry missing from SOURCE_SCHEDULES');

export const ingestBrubank = buildIngestFunction(schedule, () => runBrubankIngestion());
