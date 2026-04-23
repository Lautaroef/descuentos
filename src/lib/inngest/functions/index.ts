// All Inngest functions, exported for the serve handler.
//
// Import every function into this barrel so adding a new source becomes a
// one-line change both here and in src/lib/inngest/schedules.ts. The serve
// handler imports `ALL_FUNCTIONS` — it doesn't need to know the name of every
// function, just the array shape.
import { ingestModo } from './ingest-modo.js';
import { ingestCuentaDni } from './ingest-cuentadni.js';
import { ingestBrubank } from './ingest-brubank.js';
import { ingestNaranjax } from './ingest-naranjax.js';
import { ingestUala } from './ingest-uala.js';
import { ingestPersonalPay } from './ingest-personalpay.js';
import { ingestCoto } from './ingest-coto.js';
import { ingestJumbo } from './ingest-jumbo.js';
import { ingestCarrefour } from './ingest-carrefour.js';
import { healthCheck } from './health-check.js';

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
