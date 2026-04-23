// Personal Pay /beneficios extractor — PARTIAL coverage.
//
// Input: the markdown of https://www.personalpay.com.ar/beneficios (301 →
// https://www.personal.com.ar/pay/beneficios). Rendered merchant grid, paginated
// (~96 partners across 8 pages). Each card exposes merchant + pct + day phrase.
//
// KNOWN GAP (documented, NOT invented):
//   Topes are summarized in an IMAGE (Desk_tabla_v2.webp) by Nivel 1/2/3 tier.
//   Firecrawl markdown does not OCR. The `beneficiosclub.personalpay.dev` AWS
//   API Gateway backend (a06k96u4je.execute-api.us-east-1.amazonaws.com/prod/
//   club-personal/back-office) responds with 401/403 Unauthorized to
//   unauthenticated probes — it's an authenticated back-office endpoint, not
//   a public partner catalog feed.
//
//   Result: we emit Promo rows with `tope: null` (honest data) and flag the
//   source in the sources seed as "partial coverage". Triangulation with press
//   articles (iProUp monthly Personal Pay roundups) can populate topes later.
//
// Canonical-id strategy:
//   Row id = uuidV5(`${source_url}#${merchant}#${pct}#${days-label}`, PERSONALPAY_NAMESPACE)
//
// Same policy as Naranja X. `bulk` source.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

export const PERSONALPAY_SOURCE_ID = 'personalpay';
// The canonical URL is the short form; Firecrawl follows the 301.
export const PERSONALPAY_SOURCE_URL = 'https://www.personalpay.com.ar/beneficios';

const PERSONALPAY_UUID_NAMESPACE = 'd3e4f5a6-7b8c-5d9e-a0f1-2b3c4d5e6f70';

// =============================================================================
// Prompt.
// =============================================================================
export const PERSONALPAY_PROMPT = `You extract Personal Pay partner benefits from a hub
catalog page. Each partner card shows a merchant name, a percent-off badge, and a
day-of-week phrase (e.g. "Miércoles", "Todos los días", "Lunes a Miércoles", "Sábado").

IMPORTANT: Personal Pay's TOPES (ARS caps) are NOT shown on these cards — they live
in a summary IMAGE. Always emit tope=null and tope_period=null; downstream press
triangulation fills these in later. Do NOT invent tope values.

Output: { "promos": [ ... ] }. One entry per partner card. Fields:

- merchant: exactly as shown ("Farmacia Central Oeste", "Farmalife", "Lázaro",
  "Personal Flow", "Taxi Premium", "Tienda Personal", etc.).
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro. Map:
    * Farmacia / Farmalife / Central Oeste → farmacia
    * Go Bar / restaurants / heladerías → gastronomia
    * Supermercado La Reina / supers → supermercado
    * Taxi / Cabify / transporte → transporte
    * Combustible / YPF / Axion → combustible
    * Recargas (phone) / Personal Flow / servicios / Tienda Personal → otro
    * Indumentaria / Lázaro → indumentaria
    * Electro (Samsung, etc.) → electro
- pct: integer. "20%" → 20.
- tope: ALWAYS null (see note above).
- tope_period: ALWAYS null.
- valid_days:
    * "Todos los días" → [0,1,2,3,4,5,6]
    * "Lunes" → [1]; "Martes" → [2]; "Miércoles" → [3]; "Jueves" → [4];
      "Viernes" → [5]; "Sábado" → [6]; "Domingo" → [0]
    * "Lunes, Martes" / "Lunes y Martes" → [1,2]
    * "Lunes a Miércoles" → [1,2,3]
    * "Lunes a viernes" → [1,2,3,4,5]
    * "Fin de semana" → [0,6]
- valid_regions: []
- valid_from: first day of current month (defensible floor; cards don't declare a start).
- valid_to: **null by default**. Emit null UNLESS a card explicitly states a
  per-card end date in one of these forms: "Vigencia hasta DD/MM/YY", "Válido
  hasta DD/MM/YY", "Hasta el DD/MM/YY", "Hasta el DD de <mes>". If NONE of
  those markers appears for a card, valid_to MUST be null. Do NOT default to
  end-of-month. Do NOT infer from the scraping month. Personal Pay's hub is a
  rolling Nivel-tier catalog; almost every card is null.
- requires_min_spend: null.
- promo_type: "cashback" (Personal Pay's "beneficio" mechanic is cashback by
  default, regardless of whether we can see the tope).

Emit ONE entry per card. Skip duplicates that appear from the paginator.`;

// =============================================================================
// LLM-output schema.
// =============================================================================
const LlmPromo = z.object({
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
  tope_period: z.union([z.enum(['ticket', 'day', 'week', 'month']), z.literal(''), z.null()]),
  valid_days: z.array(z.number().int().min(0).max(6)),
  valid_regions: z.array(z.string()),
  valid_from: z.string(),
  // null = "the page did not declare an end date"; any date = the page stated one.
  valid_to: z.string().nullable(),
  requires_min_spend: z.number().nullable(),
  promo_type: z.enum(['cashback', 'cuotas', 'mixed']),
});
type LlmPromo = z.infer<typeof LlmPromo>;

const LlmPayload = z.object({ promos: z.array(LlmPromo) });
type LlmPayload = z.infer<typeof LlmPayload>;

const GEMINI_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    promos: {
      type: 'ARRAY',
      items: {
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
          valid_regions: { type: 'ARRAY', items: { type: 'STRING' } },
          valid_from: { type: 'STRING', description: 'YYYY-MM-DD' },
          valid_to: {
            type: 'STRING',
            description: 'YYYY-MM-DD, or null if the page did not declare a vigencia for this card',
            nullable: true,
          },
          requires_min_spend: { type: 'NUMBER', nullable: true },
          promo_type: { type: 'STRING', enum: ['cashback', 'cuotas', 'mixed'] },
        },
        required: [
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
          'promo_type',
        ],
        propertyOrdering: [
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
          'promo_type',
        ],
      },
    },
  },
  required: ['promos'],
};

// =============================================================================
// Deterministic UUID v5.
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

export function personalpayPromoId(
  source_url: string,
  merchant: string,
  pct: number,
  valid_days: number[],
): string {
  const daysLabel = [...valid_days].sort((a, b) => a - b).join(',');
  const name = `${source_url}#${merchant.trim().toLowerCase()}#${pct}#${daysLabel}`;
  return uuidV5(name, PERSONALPAY_UUID_NAMESPACE);
}

// =============================================================================
// valid_to invariant — evidence-based guard.
//
// Same policy as Brubank (see scripts/lib/brubank-extract.ts for the full
// rationale). Personal Pay's hub is a rolling Nivel-tier catalog with no
// per-card vigencia. If the LLM emits a date when the page has no end-date
// markers, we force null — any date is a hallucination.
//
// If the page ever gains end-date markers (e.g., a "Vigencia del DD/MM/YY al
// DD/MM/YY" ribbon on seasonal pushes), the LLM's per-row choice is trusted.
// =============================================================================

const PERSONALPAY_END_DATE_MARKER = new RegExp(
  [
    'vigencia\\s+hasta',
    'v[aá]lid[oa]\\s+hasta',
    'v[aá]lido?s?\\s+del?',
    'hasta\\s+el\\s+\\d{1,2}[\\s/]',
    'hasta\\s+el\\s+\\d{1,2}\\s+de\\s+[a-z]+',
    'vigencia\\s+del\\s+\\d',
    'desde\\s+el\\s+\\d{1,2}[\\s/].*hasta\\s+el\\s+\\d',
  ].join('|'),
  'i',
);

/**
 * Exported for tests. Returns true iff the source markdown contains at least
 * one explicit end-date marker that could plausibly justify a non-null valid_to
 * somewhere on the page.
 */
export function markdownDeclaresEndDate(markdown: string): boolean {
  return PERSONALPAY_END_DATE_MARKER.test(markdown);
}

// =============================================================================
// Extraction.
// =============================================================================
export interface ExtractPersonalPayPromosArgs {
  source_url: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmPayload; usage: GeminiUsage }>;
}

export interface ExtractPersonalPayPromosResult {
  promos: Promo[];
  ids: string[];
  usage: GeminiUsage;
  rejected_count: number;
  rejected_reasons: string[];
}

export async function extractPersonalPayPromos(
  args: ExtractPersonalPayPromosArgs,
): Promise<ExtractPersonalPayPromosResult> {
  const { source_url, markdown } = args;

  let payload: LlmPayload;
  let usage: GeminiUsage;
  if (args.llmOverride) {
    const r = await args.llmOverride(markdown);
    payload = r.data;
    usage = r.usage;
  } else {
    const r = await extractStructured({
      prompt: `${PERSONALPAY_PROMPT}\n\nsource_url: ${source_url}\nwallet: ["personalpay"]  (always)`,
      content: markdown,
      schema: LlmPayload,
      schemaForModel: GEMINI_RESPONSE_SCHEMA,
      maxOutputTokens: 8192,
    });
    payload = r.data;
    usage = r.usage;
  }

  const now = new Date().toISOString();
  const promos: Promo[] = [];
  const ids: string[] = [];
  const rejected_reasons: string[] = [];
  const seenIds = new Set<string>();

  // Evidence-based valid_to guard. See the comment block above
  // markdownDeclaresEndDate for the policy rationale.
  const pageDeclaresEndDate = markdownDeclaresEndDate(markdown);

  for (const item of payload.promos) {
    // Hard guard: Personal Pay's topes are image-locked and auth-gated (see file
    // header). The prompt tells the LLM to emit `tope=null`, but we FORCE null
    // here regardless of what Gemini returned. Any non-null value would be a
    // hallucination we can't verify — better to drop it than upsert invented
    // data. If Phase 3.3+ press-triangulation ever yields real topes, those
    // rows come from a different source_id and aren't constrained by this rule.
    const tope = null;
    const tope_period = null;

    // Same invariant for valid_to: if the page has no end-date markers at all,
    // any date from the LLM is a hallucination. Force null.
    const valid_to = pageDeclaresEndDate ? (item.valid_to ?? null) : null;

    const id = personalpayPromoId(source_url, item.merchant, item.pct, item.valid_days);
    if (seenIds.has(id)) continue;

    const candidate: Promo = {
      source_id: PERSONALPAY_SOURCE_ID,
      source_url,
      merchant: item.merchant,
      category: item.category,
      wallet: ['personalpay'],
      issuer_bank: ['personalpay'],
      pct: item.pct,
      promo_type: item.promo_type,
      tope,
      tope_period,
      valid_days: item.valid_days,
      valid_regions: item.valid_regions ?? [],
      valid_from: item.valid_from,
      valid_to,
      requires_min_spend: item.requires_min_spend,
      last_seen_at: now,
    };

    const zr = PromoSchema.safeParse(candidate);
    if (!zr.success) {
      const issues = zr.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      rejected_reasons.push(`${item.merchant} (pct=${item.pct}): ${issues}`);
      continue;
    }

    promos.push(zr.data);
    ids.push(id);
    seenIds.add(id);
  }

  return {
    promos,
    ids,
    usage,
    rejected_count: rejected_reasons.length,
    rejected_reasons,
  };
}
