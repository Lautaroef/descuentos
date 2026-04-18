// Benchmark: Gemini 2.5 Flash vs. Firecrawl `firecrawl_extract` for MODO promo extraction.
//
// Purpose: decide whether to replace `firecrawl_extract` (~$0.023/call, ~28 credits) with
// direct Gemini 2.5 Flash calls (~$0.002/call) per the plan in
// `docs/firecrawl-alternative-analysis.md`.
//
// Baseline = 10 known-good Firecrawl v2 extractions in
// `scripts/samples/modo-stress/extraction-sweep.json`. Raw markdown inputs (one per slug)
// live in `scripts/samples/modo-stress/raw/<slug>.md` (re-scraped via firecrawl_scrape,
// onlyMainContent=true, 2026-04-18).
//
// Output:
//   - CSV:     scripts/samples/llm-comparison/gemini-benchmark.csv
//   - Raw:     scripts/samples/llm-comparison/gemini-benchmark.json  (full per-page payload)
//
// Usage: pnpm tsx scripts/benchmark-llm.ts

import { config as loadEnv } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';

// Load .env.local (same pattern as scripts/lib/db.ts).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env.local') });
loadEnv({ path: resolve(__dirname, '..', '.env'), override: false });

// =============================================================================
// Canonical schema we score against — matches scripts/promo-schema.ts but tolerant
// of the same two normalization quirks validate-modo-stress.ts applies:
//   - empty-string tope_period → null
//   - default source_id / wallet when the LLM omits them
// =============================================================================
const Promo = z.object({
  source_id: z.string().default('modo'),
  source_url: z.string().url(),
  merchant: z.string(),
  category: z.enum([
    'supermercado',
    'farmacia',
    'gastronomia',
    'combustible',
    'transporte',
    'indumentaria',
    'electro',
    'otro',
  ]),
  wallet: z.array(
    z.enum(['modo', 'mercadopago', 'cuentadni', 'uala', 'naranjax', 'personalpay', 'brubank']),
  ),
  pct: z.number(),
  tope: z.number().nullable(),
  tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable(),
  valid_days: z.array(z.number().int().min(0).max(6)),
  valid_regions: z.array(z.string()),
  valid_from: z.string().date(),
  valid_to: z.string().date(),
  requires_min_spend: z.number().nullable(),
  issuer_bank: z.array(z.string()).optional(),
  variants: z
    .array(
      z.object({
        pct: z.number(),
        tope: z.number().nullable().optional(),
        tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable().optional(),
        category_scope: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

type Promo = z.infer<typeof Promo>;

// =============================================================================
// v2 extraction prompt — copied verbatim from docs/modo-stress-test.md "Extraction
// prompt (final, refined — production-ready)". This is the prompt Firecrawl ran to
// get 10/10 schema-valid in the baseline.
// =============================================================================
const V2_PROMPT = `Extract the MODO promo into this exact schema.

FOR valid_days FIELD (MOST IMPORTANT):

Step 1: Find the legal text section (usually "1. Condiciones generales" or similar).
Step 2: Search for weekday phrasings IN ORDER OF PRIORITY:
  - "los días MARTES" / "los días martes" / "todos los MARTES"  → [2]
  - "los días MIÉRCOLES" / "Válida los días miércoles"          → [3]
  - "los días LUNES" / "TODOS LOS LUNES"                        → [1]
  - "los días JUEVES"                                           → [4]
  - "los días VIERNES"                                          → [5]
  - "los días SÁBADO"                                           → [6]
  - "los días DOMINGO"                                          → [0]
  - "lunes a viernes"                                           → [1,2,3,4,5]
  - "sábado y domingo"                                          → [0,6]
  - "miércoles y jueves"                                        → [3,4]
  - "martes y jueves"                                           → [2,4]
Step 3: If legal text has NO weekday restriction AND the "Días que aplica" block says
  "TODOS LOS DÍAS", return [0,1,2,3,4,5,6].
Step 4: If legal text has NO weekday AND the block shows the L M X J V S D icon row
  (renders flat in markdown), do NOT default to all 7 — look again for any capitalized
  weekday in the legal text.

valid_days_reasoning (REQUIRED): quote the exact legal-text fragment that justified
your valid_days choice. This forces explicit grounding.

OTHER FIELDS:
- pct: main % reintegro. If multi-rate (e.g. "25% indumentaria, 10% perfumería"),
  return HIGHEST and populate variants[].
- tope: ARS cap; "Sin tope"/"¡Sin tope!" → null. Parse "$25.000" → 25000.
- tope_period: ticket | day | week | month. "por mes"/"mensual" → month.
  "por promo" → month. If tope is null, use null.
- valid_regions: National → []. Regional bank alone:
    Banco Corrientes → ["AR-W"],
    Banco Bica / Banco Santa Fe → ["AR-S"],
    Banco Entre Ríos → ["AR-E"],
    Banco San Juan → ["AR-J"],
    Banco Santa Cruz → ["AR-Z"].
- valid_from / valid_to: YYYY-MM-DD from "Del DD/MM/YY al DD/MM/YY".
- requires_min_spend: ARS from "Monto mínimo de compra $X". null if absent.
  IMPORTANT: "saldo mínimo de $X" is an ACCOUNT BALANCE requirement, not a purchase
  minimum — leave requires_min_spend null in that case.
- merchant: retailer name.
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro.
- issuer_bank: array from "Bancos adheridos" AND the legal-text "Entidades Adheridas"
  section. Prefer the legal-text list (complete) over the icon strip (truncated with
  "+N" badge). Lowercase short names: nacion, galicia, bbva, santander, macro, icbc,
  supervielle, credicoop, ciudad, bancor, comafi, columbia, entrerios, santafe,
  sanjuan, santacruz, bancodelsol, corrientes, bica, yoy, buepp.
- wallet: always ["modo"].
- variants: REQUIRED when the page describes 2+ distinct (pct, category_scope) rates
  under one URL. Each variant: {pct, tope, tope_period, category_scope, notes}.`;

// =============================================================================
// Response schema — Gemini structured-output format.
//
// We build the schema using @google/genai's `Type` enum rather than auto-converting
// from Zod. Reason: Gemini's responseSchema subset is narrower than full JSON Schema
// (no `anyOf`, no `oneOf`, no union `nullable`). Hand-rolling ensures we stay inside
// the supported dialect and keeps the prompt and schema tightly coupled.
// =============================================================================
const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING },
    category: {
      type: Type.STRING,
      enum: [
        'supermercado',
        'farmacia',
        'gastronomia',
        'combustible',
        'transporte',
        'indumentaria',
        'electro',
        'otro',
      ],
    },
    pct: { type: Type.NUMBER },
    tope: { type: Type.NUMBER, nullable: true },
    tope_period: {
      type: Type.STRING,
      enum: ['ticket', 'day', 'week', 'month'],
      nullable: true,
    },
    valid_days: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    valid_days_reasoning: { type: Type.STRING },
    valid_regions: { type: Type.ARRAY, items: { type: Type.STRING } },
    valid_from: { type: Type.STRING, description: 'YYYY-MM-DD' },
    valid_to: { type: Type.STRING, description: 'YYYY-MM-DD' },
    requires_min_spend: { type: Type.NUMBER, nullable: true },
    issuer_bank: { type: Type.ARRAY, items: { type: Type.STRING } },
    wallet: { type: Type.ARRAY, items: { type: Type.STRING } },
    variants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pct: { type: Type.NUMBER },
          tope: { type: Type.NUMBER, nullable: true },
          tope_period: {
            type: Type.STRING,
            enum: ['ticket', 'day', 'week', 'month'],
            nullable: true,
          },
          category_scope: { type: Type.STRING },
          notes: { type: Type.STRING },
        },
        propertyOrdering: ['pct', 'tope', 'tope_period', 'category_scope', 'notes'],
      },
    },
  },
  required: [
    'merchant',
    'category',
    'pct',
    'tope',
    'tope_period',
    'valid_days',
    'valid_days_reasoning',
    'valid_regions',
    'valid_from',
    'valid_to',
    'requires_min_spend',
    'issuer_bank',
    'wallet',
  ],
  propertyOrdering: [
    'merchant',
    'category',
    'pct',
    'tope',
    'tope_period',
    'valid_days',
    'valid_days_reasoning',
    'valid_regions',
    'valid_from',
    'valid_to',
    'requires_min_spend',
    'issuer_bank',
    'wallet',
    'variants',
  ],
} as const;

// =============================================================================
// Pricing — https://ai.google.dev/pricing (verified 2026-04-18 via docs).
// Gemini 2.5 Flash (<= 128k context, text only).
// =============================================================================
const PRICING = {
  model: 'gemini-2.5-flash',
  inputUsdPerMillionTokens: 0.3,
  outputUsdPerMillionTokens: 2.5,
} as const;

function costUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * PRICING.inputUsdPerMillionTokens) / 1_000_000 +
    (outputTokens * PRICING.outputUsdPerMillionTokens) / 1_000_000
  );
}

// =============================================================================
// Known-good baselines (Firecrawl v2 ground truth for these 10 slugs).
// =============================================================================
type GroundTruth = {
  slug: string;
  url: string;
  expected: Record<string, unknown>;
  edge_case?: string;
};

async function loadGroundTruth(): Promise<GroundTruth[]> {
  const path = resolve(__dirname, 'samples', 'modo-stress', 'extraction-sweep.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  return data.pages.map((p: any) => {
    const ext = p.extract_v2 ?? p.extract_v1;
    const expected = { ...ext.result };
    // Normalize empty-string tope_period → null (same as validate-modo-stress.ts does).
    if (expected.tope_period === '') expected.tope_period = null;
    return {
      slug: p.slug,
      url: p.url,
      expected,
      edge_case: p.edge_case,
    };
  });
}

async function loadRawMarkdown(slug: string): Promise<string> {
  const path = resolve(__dirname, 'samples', 'modo-stress', 'raw', `${slug}.md`);
  return readFile(path, 'utf8');
}

// =============================================================================
// Gemini call.
// =============================================================================
type CallResult = {
  rawText: string;
  parsed: any | null;
  parseError: string | null;
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  latencyMs: number;
  costUsd: number;
};

async function runGemini(client: GoogleGenAI, markdown: string, url: string): Promise<CallResult> {
  const contents = `${V2_PROMPT}

source_url: ${url}
wallet: ["modo"]  (always)

PAGE CONTENT:
---
${markdown}
---

Respond ONLY with the JSON object.`;

  const t0 = Date.now();
  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      // Disable "thinking" — extraction is deterministic, reasoning tokens just inflate
      // latency + cost + can starve the final JSON output inside maxOutputTokens.
      // (In our first run without this, Gemini silently truncated 3/10 outputs mid-JSON
      // because thinking tokens ate most of the 2048 budget.)
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 2048,
    },
  });
  const latencyMs = Date.now() - t0;

  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const thoughtsTokens = (usage as any)?.thoughtsTokenCount ?? 0;
  const rawText = response.text ?? '';

  let parsed: any = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (e: any) {
    parseError = e?.message ?? String(e);
  }

  return {
    rawText,
    parsed,
    parseError,
    inputTokens,
    outputTokens,
    thoughtsTokens,
    latencyMs,
    costUsd: costUsd(inputTokens, outputTokens + thoughtsTokens),
  };
}

// =============================================================================
// Field-by-field comparison.
//
// For each field we (a) extract the value from Firecrawl ground truth + Gemini
// output, (b) compare with a field-appropriate equality check, (c) record
// matched / diverged with a detail note.
// =============================================================================

type FieldComparison = {
  field: string;
  matched: boolean;
  firecrawl: unknown;
  gemini: unknown;
  note?: string;
};

const SCORED_FIELDS = [
  'merchant',
  'category',
  'pct',
  'tope',
  'tope_period',
  'valid_days',
  'valid_regions',
  'valid_from',
  'valid_to',
  'requires_min_spend',
  'issuer_bank',
] as const;

function normalizeBank(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^banco\s+/, '')
    .replace(/^billetera\s+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function compareField(field: string, fc: unknown, gm: unknown): FieldComparison {
  // Exact-match scalars.
  if (['merchant', 'category', 'valid_from', 'valid_to'].includes(field)) {
    const matched = String(fc ?? '').trim() === String(gm ?? '').trim();
    return { field, matched, firecrawl: fc, gemini: gm };
  }

  // Numeric/nullable — treat null-equivalent numerics strictly.
  if (['pct', 'tope', 'requires_min_spend'].includes(field)) {
    const matched = (fc ?? null) === (gm ?? null);
    return { field, matched, firecrawl: fc, gemini: gm };
  }

  if (field === 'tope_period') {
    const a = fc === '' ? null : fc;
    const b = gm === '' ? null : gm;
    return { field, matched: a === b, firecrawl: fc, gemini: gm };
  }

  // Array-valued — order-independent compare, element-wise.
  if (field === 'valid_days') {
    const a = [...((fc as number[]) ?? [])].sort((x, y) => x - y);
    const b = [...((gm as number[]) ?? [])].sort((x, y) => x - y);
    const matched = a.length === b.length && a.every((x, i) => x === b[i]);
    return { field, matched, firecrawl: fc, gemini: gm };
  }

  if (field === 'valid_regions') {
    const a = [...((fc as string[]) ?? [])].map((x) => x.toLowerCase()).sort();
    const b = [...((gm as string[]) ?? [])].map((x) => x.toLowerCase()).sort();
    const matched = a.length === b.length && a.every((x, i) => x === b[i]);
    return { field, matched, firecrawl: fc, gemini: gm };
  }

  if (field === 'issuer_bank') {
    const a = [...((fc as string[]) ?? [])].map(normalizeBank).filter(Boolean).sort();
    const b = [...((gm as string[]) ?? [])].map(normalizeBank).filter(Boolean).sort();
    const setA = new Set(a);
    const setB = new Set(b);
    const overlap = [...setA].filter((x) => setB.has(x)).length;
    const matched = a.length === b.length && a.every((x, i) => x === b[i]);
    const note = matched
      ? undefined
      : `overlap=${overlap}/${Math.max(a.length, b.length)} fc_only=[${[...setA]
          .filter((x) => !setB.has(x))
          .join(',')}] gm_only=[${[...setB].filter((x) => !setA.has(x)).join(',')}]`;
    return { field, matched, firecrawl: fc, gemini: gm, note };
  }

  return { field, matched: JSON.stringify(fc) === JSON.stringify(gm), firecrawl: fc, gemini: gm };
}

// =============================================================================
// Concurrency primitive.
// =============================================================================
async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// =============================================================================
// Main.
// =============================================================================
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env.local');

  const client = new GoogleGenAI({ apiKey });

  const truth = await loadGroundTruth();
  console.log(`Loaded ${truth.length} ground-truth pages from extraction-sweep.json\n`);

  type PerPageResult = {
    slug: string;
    url: string;
    edge_case?: string;
    schema_valid: boolean;
    zod_issues: string[];
    parse_error: string | null;
    fields_matched: number;
    fields_diverged: number;
    field_comparisons: FieldComparison[];
    input_tokens: number;
    output_tokens: number;
    thoughts_tokens: number;
    latency_ms: number;
    cost_usd: number;
    gemini_raw: string;
    gemini_parsed: any;
  };

  const results = await runPool(truth, 3, async (page) => {
    const markdown = await loadRawMarkdown(page.slug);
    console.log(`[${page.slug}] calling Gemini (markdown ${markdown.length} chars)...`);
    const call = await runGemini(client, markdown, page.url);

    // Validate against canonical Promo schema (with the same normalization the
    // validator script uses).
    let schemaValid = false;
    let zodIssues: string[] = [];
    if (call.parsed) {
      const candidate = {
        source_id: 'modo',
        source_url: page.url,
        ...call.parsed,
        tope_period: call.parsed.tope_period === '' ? null : call.parsed.tope_period,
        wallet: call.parsed.wallet ?? ['modo'],
      };
      const zr = Promo.safeParse(candidate);
      schemaValid = zr.success;
      if (!zr.success) {
        zodIssues = zr.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      }
    }

    // Field-by-field comparison vs. Firecrawl ground truth.
    const fieldComparisons: FieldComparison[] = [];
    if (call.parsed) {
      for (const f of SCORED_FIELDS) {
        fieldComparisons.push(
          compareField(f, (page.expected as any)[f], (call.parsed as any)[f]),
        );
      }
    }
    const matched = fieldComparisons.filter((c) => c.matched).length;
    const diverged = fieldComparisons.length - matched;

    const result: PerPageResult = {
      slug: page.slug,
      url: page.url,
      edge_case: page.edge_case,
      schema_valid: schemaValid,
      zod_issues: zodIssues,
      parse_error: call.parseError,
      fields_matched: matched,
      fields_diverged: diverged,
      field_comparisons: fieldComparisons,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      thoughts_tokens: call.thoughtsTokens,
      latency_ms: call.latencyMs,
      cost_usd: call.costUsd,
      gemini_raw: call.rawText,
      gemini_parsed: call.parsed,
    };

    console.log(
      `  -> schema_valid=${schemaValid} fields=${matched}/${SCORED_FIELDS.length} ` +
        `tokens_in=${call.inputTokens} tokens_out=${call.outputTokens} thoughts=${call.thoughtsTokens} ` +
        `latency=${call.latencyMs}ms cost=$${call.costUsd.toFixed(6)}`,
    );
    if (!schemaValid && zodIssues.length) {
      for (const i of zodIssues) console.log(`     zod: ${i}`);
    }
    if (call.parseError) console.log(`     parse_error: ${call.parseError}`);

    return result;
  });

  // ==========================================================================
  // Emit CSV + JSON artifacts.
  // ==========================================================================
  const outDir = resolve(__dirname, 'samples', 'llm-comparison');
  await mkdir(outDir, { recursive: true });

  const csvRows = [
    ['slug', 'schema_valid', 'fields_matched', 'fields_diverged', 'input_tokens', 'output_tokens', 'latency_ms', 'cost_usd'].join(
      ',',
    ),
    ...results.map((r) =>
      [
        r.slug,
        r.schema_valid,
        r.fields_matched,
        r.fields_diverged,
        r.input_tokens,
        r.output_tokens,
        r.latency_ms,
        r.cost_usd.toFixed(6),
      ].join(','),
    ),
  ];
  await writeFile(resolve(outDir, 'gemini-benchmark.csv'), csvRows.join('\n') + '\n');
  await writeFile(
    resolve(outDir, 'gemini-benchmark.json'),
    JSON.stringify(
      {
        model: PRICING.model,
        pricing: PRICING,
        run_at: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );

  // ==========================================================================
  // Summary.
  // ==========================================================================
  const schemaValidCount = results.filter((r) => r.schema_valid).length;
  const totalFieldCells = results.length * SCORED_FIELDS.length;
  const matchedCells = results.reduce((a, r) => a + r.fields_matched, 0);
  const totalInputTokens = results.reduce((a, r) => a + r.input_tokens, 0);
  const totalOutputTokens = results.reduce((a, r) => a + r.output_tokens, 0);
  const totalCost = results.reduce((a, r) => a + r.cost_usd, 0);
  const avgCost = totalCost / results.length;
  const sortedLat = [...results].map((r) => r.latency_ms).sort((a, b) => a - b);
  const p50 = sortedLat[Math.floor(sortedLat.length * 0.5)];
  const p95 = sortedLat[Math.floor(sortedLat.length * 0.95)];
  const avgLat = sortedLat.reduce((a, x) => a + x, 0) / sortedLat.length;

  console.log('\n==================================================');
  console.log('GEMINI 2.5 FLASH BENCHMARK — SUMMARY');
  console.log('==================================================');
  console.log(`Pages processed:          ${results.length}`);
  console.log(`Schema-valid rate:        ${schemaValidCount}/${results.length}`);
  console.log(
    `Field accuracy:           ${matchedCells}/${totalFieldCells} ` +
      `(${((matchedCells / totalFieldCells) * 100).toFixed(1)}% vs. Firecrawl ground truth)`,
  );
  console.log(`Tokens (in / out / tot):  ${totalInputTokens} / ${totalOutputTokens} / ${totalInputTokens + totalOutputTokens}`);
  console.log(`Latency avg/p50/p95:      ${avgLat.toFixed(0)}ms / ${p50}ms / ${p95}ms`);
  console.log(`Total cost (10 pages):    $${totalCost.toFixed(6)}`);
  console.log(`Avg cost per page:        $${avgCost.toFixed(6)}`);
  console.log(
    `Projected at 400/month:   $${(avgCost * 400).toFixed(4)}  ` +
      `(Firecrawl-extract @ $0.023/page = $${(0.023 * 400).toFixed(2)}/mo)`,
  );
  console.log('\nPer-page field divergences:');
  for (const r of results) {
    const diverges = r.field_comparisons.filter((c) => !c.matched);
    if (diverges.length === 0) continue;
    console.log(`  [${r.slug}]`);
    for (const c of diverges) {
      const fc = JSON.stringify(c.firecrawl);
      const gm = JSON.stringify(c.gemini);
      const n = c.note ? ` — ${c.note}` : '';
      console.log(`    ${c.field}: firecrawl=${fc} gemini=${gm}${n}`);
    }
  }

  console.log(`\nArtifacts:\n  ${outDir}/gemini-benchmark.csv\n  ${outDir}/gemini-benchmark.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
