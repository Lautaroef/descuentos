// Direct Gemini 2.5 Flash wrapper for structured extraction.
// Replaces `firecrawl_extract` (~28 credits/page) with a commodity LLM call (~$0.0013/page).
// Architectural decision rationale: docs/firecrawl-alternative-analysis.md.
//
// CRITICAL: `thinkingConfig.thinkingBudget = 0` is mandatory. Non-zero thinking tokens
// silently starve `maxOutputTokens`, truncating JSON mid-stream (3/10 outputs truncated in
// the first benchmark run). See scripts/samples/llm-comparison/gemini-benchmark-summary.md.
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { z, type ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env.local') });
loadEnv({ path: resolve(__dirname, '..', '..', '.env'), override: false });

// Gemini 2.5 Flash pricing — https://ai.google.dev/pricing (verified 2026-04-18).
export const GEMINI_PRICING = {
  model: 'gemini-2.5-flash',
  inputUsdPerMillionTokens: 0.3,
  outputUsdPerMillionTokens: 2.5,
} as const;

export interface GeminiUsage {
  input_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  cost_usd: number;
}

export interface ExtractStructuredArgs<T> {
  prompt: string;
  content: string;
  schema: ZodType<T>;
  /**
   * Optional override when Zod→JSON-Schema conversion doesn't cleanly match Gemini's
   * `responseSchema` subset (e.g. discriminated unions). Pass a hand-rolled schema in that
   * case. If omitted, we auto-convert via `zod-to-json-schema` with the `openApi3` target
   * which is closest to Gemini's accepted dialect.
   */
  schemaForModel?: Record<string, unknown>;
  /** Override model (e.g. pin a dated SKU). Defaults to 'gemini-2.5-flash'. */
  model?: string;
  /** Max output tokens. Default 2048 — enough for our Promo payloads with variants. */
  maxOutputTokens?: number;
}

export interface ExtractStructuredResult<T> {
  data: T;
  usage: GeminiUsage;
  raw: string;
}

// Simple process-level counter for the "non-zero thoughts token" anomaly. Surfaces via
// getThoughtsTokenWarnings() so orchestrators can include it in their summary output.
let thoughtsTokenWarningCount = 0;

export function getThoughtsTokenWarnings(): number {
  return thoughtsTokenWarningCount;
}

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Populate .env.local before running extraction.');
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

function costUsd(inputTokens: number, outputTokens: number): number {
  const raw =
    (inputTokens * GEMINI_PRICING.inputUsdPerMillionTokens) / 1_000_000 +
    (outputTokens * GEMINI_PRICING.outputUsdPerMillionTokens) / 1_000_000;
  return Math.round(raw * 10_000) / 10_000;
}

/**
 * Gemini's `responseSchema` only supports a subset of JSON Schema. The `zod-to-json-schema`
 * output needs a scrub to remove fields that make Gemini reject the request.
 */
function scrubForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    // Strip meta keys Gemini doesn't accept.
    if (k === '$schema' || k === 'additionalProperties' || k === 'definitions' || k === '$ref') {
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrubForGemini(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' ? scrubForGemini(item as Record<string, unknown>) : item,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Extract a structured payload with Gemini 2.5 Flash.
 *
 * - `temperature: 0`, `responseMimeType: 'application/json'`, schema-enforced output.
 * - `thinkingConfig.thinkingBudget: 0` (mandatory — see module header).
 * - Validates against the Zod schema; throws on validation failure with raw text in the error.
 * - Returns cost calculated from `usageMetadata` + our pinned pricing.
 */
export async function extractStructured<T>(args: ExtractStructuredArgs<T>): Promise<ExtractStructuredResult<T>> {
  const client = getClient();
  const model = args.model ?? GEMINI_PRICING.model;
  const maxOutputTokens = args.maxOutputTokens ?? 2048;

  const jsonSchema =
    args.schemaForModel ?? scrubForGemini(zodToJsonSchema(args.schema, { target: 'openApi3' }) as Record<string, unknown>);

  const contents = `${args.prompt}\n\nPAGE CONTENT:\n---\n${args.content}\n---\n\nRespond ONLY with the JSON object.`;

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: jsonSchema as any,
      // MANDATORY — see module header.
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens,
    },
  });

  const usage = response.usageMetadata;
  const input_tokens = usage?.promptTokenCount ?? 0;
  const output_tokens = usage?.candidatesTokenCount ?? 0;
  const thoughts_tokens = (usage as any)?.thoughtsTokenCount ?? 0;

  if (thoughts_tokens > 0) {
    thoughtsTokenWarningCount += 1;
    console.warn(
      `[gemini] WARNING: thoughtsTokenCount=${thoughts_tokens} (should be 0 with thinkingBudget=0). ` +
        `This indicates the SDK / model ignored the thinking directive — output may be truncated.`,
    );
  }

  const raw = response.text ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(
      `Gemini returned non-JSON text (${e?.message ?? 'parse error'}). Raw output:\n${raw}`,
    );
  }

  const zr = args.schema.safeParse(parsed);
  if (!zr.success) {
    const issues = zr.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(
      `Gemini output failed Zod validation: ${issues}. Raw output:\n${raw}`,
    );
  }

  return {
    data: zr.data as T,
    usage: {
      input_tokens,
      output_tokens,
      thoughts_tokens,
      cost_usd: costUsd(input_tokens, output_tokens + thoughts_tokens),
    },
    raw,
  };
}
