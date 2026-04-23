// Inngest serve endpoint — Next.js App Router handler.
//
// Inngest Cloud POSTs to this endpoint to execute function steps. On deploy, it
// also fetches this URL (GET) to discover registered functions and register
// cron triggers. That discovery is how the dashboard picks up a new scheduled
// function without a manual deploy step.
//
// The endpoint is public (no auth in front), which is correct: Inngest signs
// every request with INNGEST_SIGNING_KEY, and the SDK verifies the signature
// before running anything. Do NOT add auth middleware here — it would block
// Inngest itself.
//
// Runtime: nodejs. We need the full Node API surface (postgres-js, process.env,
// dynamic require from transitively-loaded libs). The edge runtime would break
// the ingestion runners.
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { ALL_FUNCTIONS } from '@/lib/inngest/functions';

export const runtime = 'nodejs';

// Vercel Hobby caps serverless function maxDuration at 300s (5 min); Pro at
// 900s (15 min). We're currently on Hobby — 300s is the ceiling. Each Inngest
// STEP runs inside one function invocation; durable orchestration splits a long
// workflow across many invocations, so a 5-minute-per-step ceiling is fine as
// long as no single step itself sits on the LLM for >5min. If any runner starts
// doing that (MODO currently averages <2min), either (a) split it into smaller
// steps via `step.run(...)` in the Inngest function, or (b) upgrade to Pro and
// bump to 900 here.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: ALL_FUNCTIONS,
  // Let the SDK read INNGEST_SIGNING_KEY from env automatically.
  // In local dev, point the Inngest Dev Server at http://localhost:3000/api/inngest.
});
