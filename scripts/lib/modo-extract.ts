// MODO extraction logic: Gemini LLM call + rawHtml regex fallback + Vigencia post-process.
//
// See docs/modo-stress-test.md for the prompt rationale. The v2 prompt was stress-validated
// 10/10 on the offline corpus. Two deterministic overrides sit on top of the LLM output:
//
//   1. `data-testid="day-of-week-selected-[LMXJVSD]"` regex on rawHtml  → `valid_days`.
//      100% deterministic, no LLM required. Overrides the LLM whenever the regex matches.
//
//   2. "Vigencia Del DD/MM/YY al DD/MM/YY" regex on the scraped markdown → `valid_from` /
//      `valid_to`. MODO pages sometimes show a Vigencia UI block date that disagrees with
//      the legal-text "Desde las 00:00 del día X" dates (typically off by 1 day). The UI
//      block is the canonical public vigencia (6 cases in the Gemini benchmark). We pick
//      the UI block value when present and log the disagreement at info level.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

const MODO_SOURCE_ID = 'modo';
const MODO_SOURCE_HOST = 'https://www.modo.com.ar';

// UUID v5 namespace for MODO promos (random UUID generated once; committed so it's stable).
const MODO_UUID_NAMESPACE = '5a8e6f9c-0f2b-4e77-a4b1-9a1c38d0f2d5';

// =============================================================================
// v2 MODO extraction prompt — COPIED VERBATIM from docs/modo-stress-test.md.
// Do not paraphrase or "clean up" — the exact wording was stress-validated 10/10.
// =============================================================================
export const MODO_V2_PROMPT = `Extract the MODO promo into this exact schema.

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
// LLM-output schema. This is narrower than canonical `Promo` — missing source_id,
// source_url, last_seen_at (filled in post-LLM). We keep it tolerant of empty-string
// tope_period (the known "Sin tope" quirk) and normalize before re-validation.
// =============================================================================
const LlmModoPayload = z.object({
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
  pct: z.number(),
  tope: z.number().nullable(),
  // Gemini occasionally emits empty string for Sin-tope pages; normalized post-parse.
  tope_period: z.union([z.enum(['ticket', 'day', 'week', 'month']), z.literal(''), z.null()]),
  valid_days: z.array(z.number().int().min(0).max(6)),
  valid_days_reasoning: z.string().optional(),
  valid_regions: z.array(z.string()),
  valid_from: z.string(),
  valid_to: z.string(),
  requires_min_spend: z.number().nullable(),
  issuer_bank: z.array(z.string()).optional(),
  wallet: z.array(z.string()).optional(),
  variants: z
    .array(
      z.object({
        pct: z.number(),
        tope: z.number().nullable().optional(),
        tope_period: z
          .union([z.enum(['ticket', 'day', 'week', 'month']), z.literal(''), z.null()])
          .optional(),
        category_scope: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

type LlmModoPayload = z.infer<typeof LlmModoPayload>;

// =============================================================================
// Hand-rolled Gemini responseSchema (openAPI-ish subset Gemini accepts).
// Auto-converting from Zod via zod-to-json-schema works for simple shapes, but this schema
// has enums + nullable + optional arrays that Gemini's validator is strict about. The
// benchmark script ships with the hand-rolled version that's known-working.
// =============================================================================
const GEMINI_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    category: {
      type: 'STRING',
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
    pct: { type: 'NUMBER' },
    tope: { type: 'NUMBER', nullable: true },
    tope_period: {
      type: 'STRING',
      enum: ['ticket', 'day', 'week', 'month'],
      nullable: true,
    },
    valid_days: { type: 'ARRAY', items: { type: 'INTEGER' } },
    valid_days_reasoning: { type: 'STRING' },
    valid_regions: { type: 'ARRAY', items: { type: 'STRING' } },
    valid_from: { type: 'STRING', description: 'YYYY-MM-DD' },
    valid_to: { type: 'STRING', description: 'YYYY-MM-DD' },
    requires_min_spend: { type: 'NUMBER', nullable: true },
    issuer_bank: { type: 'ARRAY', items: { type: 'STRING' } },
    wallet: { type: 'ARRAY', items: { type: 'STRING' } },
    variants: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          pct: { type: 'NUMBER' },
          tope: { type: 'NUMBER', nullable: true },
          tope_period: {
            type: 'STRING',
            enum: ['ticket', 'day', 'week', 'month'],
            nullable: true,
          },
          category_scope: { type: 'STRING' },
          notes: { type: 'STRING' },
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
};

// =============================================================================
// rawHtml regex fallback for valid_days.
// See docs/modo-stress-test.md §BREAKTHROUGH. Maps MODO's active-day data-testid to ISO
// weekday numbers. 100% deterministic.
// =============================================================================
const DAY_LETTER_TO_ISO: Record<string, number> = {
  D: 0,
  L: 1,
  M: 2,
  X: 3,
  J: 4,
  V: 5,
  S: 6,
};

export function validDaysFromRawHtml(rawHtml: string | null): number[] | null {
  if (!rawHtml) return null;
  const re = /data-testid="day-of-week-selected-([LMXJVSD])"/g;
  const days = new Set<number>();
  for (const match of rawHtml.matchAll(re)) {
    const letter = match[1];
    const iso = DAY_LETTER_TO_ISO[letter];
    if (typeof iso === 'number') days.add(iso);
  }
  if (days.size === 0) return null;
  return [...days].sort((a, b) => a - b);
}

// =============================================================================
// Vigencia-block override.
// MODO renders a "Vigencia" UI block with "Del DD/MM/YY al DD/MM/YY". This is the
// canonical public vigencia and is preferred over the legal-text "Desde las 00:00 del día X"
// which the LLM sometimes picks up instead. Regex matches both DD/MM/YY and DD/MM/YYYY.
// =============================================================================
function parseDdMmYy(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  let y = m[3];
  if (y.length === 2) y = `20${y}`;
  return `${y}-${mm}-${d}`;
}

export function vigenciaFromMarkdown(markdown: string | null): { from: string; to: string } | null {
  if (!markdown) return null;
  // MODO's markdown renders the block across multiple lines: a "Vigencia" header, then the
  // date line. We accept flexible whitespace so minor layout changes don't break us.
  const re = /Vigencia[^\n]*\n+\s*Del\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+al\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const m = markdown.match(re);
  if (!m) return null;
  const from = parseDdMmYy(m[1]);
  const to = parseDdMmYy(m[2]);
  if (!from || !to) return null;
  return { from, to };
}

// =============================================================================
// Deterministic UUID v5 for MODO promos.
// Uses SHA-1 per RFC 4122. Namespace is a fixed UUID (see MODO_UUID_NAMESPACE constant).
// Making promo.id deterministic means upserts are stable across runs even if (source_id,
// source_url) unique key is changed later.
// =============================================================================
function uuidV5(name: string, namespace: string): string {
  const nsBytes = Buffer.alloc(16);
  const hex = namespace.replace(/-/g, '');
  for (let i = 0; i < 16; i += 1) {
    nsBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  const nameBytes = Buffer.from(name, 'utf8');
  const h = createHash('sha1');
  h.update(nsBytes);
  h.update(nameBytes);
  const bytes = h.digest();
  // Set version (5) and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexOut = bytes.toString('hex').slice(0, 32);
  return (
    hexOut.slice(0, 8) +
    '-' +
    hexOut.slice(8, 12) +
    '-' +
    hexOut.slice(12, 16) +
    '-' +
    hexOut.slice(16, 20) +
    '-' +
    hexOut.slice(20, 32)
  );
}

export function modoPromoId(slug: string): string {
  const canonicalUrl = `${MODO_SOURCE_HOST}/promos/${slug}`;
  return uuidV5(canonicalUrl, MODO_UUID_NAMESPACE);
}

export function modoSourceUrl(slug: string): string {
  return `${MODO_SOURCE_HOST}/promos/${slug}`;
}

// =============================================================================
// Extraction — public entry point.
//
// Accepts pre-scraped markdown + rawHtml (callers fetch via lib/firecrawl). Also accepts
// an optional `llmFn` override — used by the test suite to run the pipeline offline by
// stubbing the Gemini call with known-good JSON from fixtures.
// =============================================================================
export interface ExtractModoPromoArgs {
  slug: string;
  markdown: string;
  rawHtml: string | null;
  /** Test-only override. When provided, skips the real Gemini call. */
  llmOverride?: (content: string) => Promise<{ data: LlmModoPayload; usage: GeminiUsage }>;
}

export interface ExtractModoPromoResult {
  promo: Promo;
  id: string;
  usage: GeminiUsage;
  overrides: {
    valid_days_from_rawhtml: boolean;
    dates_from_vigencia: boolean;
  };
}

export type { Promo };

export async function extractModoPromo(args: ExtractModoPromoArgs): Promise<ExtractModoPromoResult> {
  const { slug, markdown, rawHtml } = args;
  const source_url = modoSourceUrl(slug);

  // 1. LLM call.
  let llmData: LlmModoPayload;
  let usage: GeminiUsage;
  if (args.llmOverride) {
    const res = await args.llmOverride(markdown);
    llmData = res.data;
    usage = res.usage;
  } else {
    const res = await extractStructured({
      prompt: `${MODO_V2_PROMPT}\n\nsource_url: ${source_url}\nwallet: ["modo"]  (always)`,
      content: markdown,
      schema: LlmModoPayload,
      schemaForModel: GEMINI_RESPONSE_SCHEMA,
      maxOutputTokens: 2048,
    });
    llmData = res.data;
    usage = res.usage;
  }

  // Normalize empty-string tope_period → null (known Sin-tope quirk).
  const tope_period = llmData.tope_period === '' ? null : (llmData.tope_period ?? null);

  // 2. rawHtml regex override for valid_days (deterministic).
  const regexDays = validDaysFromRawHtml(rawHtml);
  const valid_days = regexDays ?? llmData.valid_days;
  const validDaysFromRaw = regexDays !== null && JSON.stringify(regexDays) !== JSON.stringify(llmData.valid_days);

  // 3. Vigencia-block override for dates.
  const vig = vigenciaFromMarkdown(markdown);
  let valid_from = llmData.valid_from;
  let valid_to = llmData.valid_to;
  let datesFromVigencia = false;
  if (vig) {
    if (vig.from !== llmData.valid_from || vig.to !== llmData.valid_to) {
      console.log(
        `[modo:${slug}] Vigencia override: from=${vig.from} (was ${llmData.valid_from}) to=${vig.to} (was ${llmData.valid_to})`,
      );
      datesFromVigencia = true;
    }
    valid_from = vig.from;
    valid_to = vig.to;
  }

  // 4. Derive promo_type from pct (cuotas-only pages have pct=0).
  const promo_type: 'cashback' | 'cuotas' | 'mixed' = llmData.pct === 0 ? 'cuotas' : 'cashback';

  // 5. Build the final Promo object.
  const now = new Date().toISOString();
  const candidate: Promo = {
    source_id: MODO_SOURCE_ID,
    source_url,
    merchant: llmData.merchant,
    category: llmData.category,
    wallet: ['modo'],
    issuer_bank: llmData.issuer_bank,
    pct: llmData.pct,
    promo_type,
    tope: llmData.tope,
    tope_period,
    valid_days,
    valid_regions: llmData.valid_regions,
    valid_from,
    valid_to,
    requires_min_spend: llmData.requires_min_spend,
    variants: llmData.variants?.map((v) => ({
      ...v,
      tope_period: v.tope_period === '' ? null : v.tope_period,
    })),
    last_seen_at: now,
  };

  // 6. Final Zod gate — the canonical schema.
  const zr = PromoSchema.safeParse(candidate);
  if (!zr.success) {
    const issues = zr.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`MODO ${slug} failed canonical Promo validation: ${issues}`);
  }

  return {
    promo: zr.data,
    id: modoPromoId(slug),
    usage,
    overrides: {
      valid_days_from_rawhtml: validDaysFromRaw,
      dates_from_vigencia: datesFromVigencia,
    },
  };
}

export function hashMarkdown(md: string): string {
  return createHash('sha256').update(md, 'utf8').digest('hex');
}
