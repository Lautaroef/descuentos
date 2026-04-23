// All Inngest functions, exported for the serve handler.
//
// Import every function into this barrel so adding a new source becomes a
// one-line change both here and in src/lib/inngest/schedules.ts. The serve
// handler imports `ALL_FUNCTIONS` — it doesn't need to know the name of every
// function, just the array shape.
import { ingestModo } from './ingest-modo';
import { ingestCuentaDni } from './ingest-cuentadni';
import { ingestBrubank } from './ingest-brubank';
import { ingestNaranjax } from './ingest-naranjax';
import { ingestUala } from './ingest-uala';
import { ingestPersonalPay } from './ingest-personalpay';
import { ingestCoto } from './ingest-coto';
import { ingestJumbo } from './ingest-jumbo';
import { ingestCarrefour } from './ingest-carrefour';
import { healthCheck } from './health-check';

export const ALL_FUNCTIONS = [
  ingestModo,
  ingestCuentaDni,
  ingestBrubank,
  ingestNaranjax,
  ingestUala,
  ingestPersonalPay,
  ingestCoto,
  ingestJumbo,
  ingestCarrefour,
  healthCheck,
];

export {
  ingestModo,
  ingestCuentaDni,
  ingestBrubank,
  ingestNaranjax,
  ingestUala,
  ingestPersonalPay,
  ingestCoto,
  ingestJumbo,
  ingestCarrefour,
  healthCheck,
};
