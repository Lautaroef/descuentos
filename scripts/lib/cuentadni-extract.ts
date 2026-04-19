// Cuenta DNI press-article extractor.
//
// Input: the markdown of a single press roundup (Ámbito / Infobae / iProfesional /
// iProUp) describing Cuenta DNI's monthly promos. Output: an array of canonical
// `Promo` rows — one press article yields N promos (Ámbito April 2026 yielded 9/9
// first try, validated in docs/long-tail-sourcing.md).
//
// Why a separate extractor (vs reusing MODO's): the input shape is different.
// MODO detail pages have fixed-label UI blocks (`Tope de reintegro`, `Vigencia Del
// DD/MM/YY`, `Días que aplica`). Press articles describe promos in prose — "40%
// los días miércoles en supermercados, tope $20.000 semanal". The LLM task is
// "parse prose into N structured rows" rather than "extract labeled fields into
// one row."
//
// Canonical-id strategy (deliberate decision — see README note on idempotency):
//
//   Row id = uuidV5(`${source_url}#${merchant}#${pct}`, CUENTADNI_NAMESPACE)
//
// We tuple on (source_url, merchant, pct) rather than on (source_id, merchant, pct).
// Reasoning: the SAME promo (30% marcas destacadas, tope $15k/mes) may appear in
// different monthly articles as the content cadence rotates. If we keyed on
// content-only, a re-run against a new month's article would UPDATE the existing
// row with the latest source_url — losing historical provenance, which we need
// for "where did this promo come from" audit trails.
//
// Trade-off: when the article URL rotates (monthly), we INSERT fresh rows rather
// than UPDATE the prior month's. This is intentional for Phase 3. Phase 4 dedup
// (see build-plan.md §4.1) will collapse equivalent promos across months using a
// canonical hash on the content tuple; the source_url-based keying here gives
// the dedup pass clean provenance to work with.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

export const CUENTADNI_SOURCE_ID = 'cuenta-dni';

// UUID v5 namespace for Cuenta DNI promos. Fixed once; stable across runs.
const CUENTADNI_UUID_NAMESPACE = '7f2a1c8e-3b4d-5e6f-9a8b-1c2d3e4f5a6b';

// =============================================================================
// Prompt — tuned for press-article prose. Emits an ARRAY of Promo objects.
// =============================================================================
export const CUENTADNI_PROMPT = `You extract Cuenta DNI promos from a press article. The
article describes multiple distinct promos in prose — e.g. "los miércoles, 25% en
supermercados, tope $20.000 semanal". Emit ONE JSON object per distinct promo you find.

Return a JSON object of shape: { "promos": [ ... ] } where each promo has these fields:

- merchant: short label for the rubro/merchant group ("Ferias y mercados bonaerenses",
  "Comercios de cercanía", "Gastronomía", "Full YPF", "Supermercados", etc.). Copy the
  article's heading/phrasing.
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro. Map:
    * supermercados → supermercado
    * farmacias, perfumerías → farmacia
    * bares, restaurantes, heladerías, gastronomía → gastronomia
    * combustibles, Full YPF (with or without "no combustibles" caveat) → combustible
    * colectivos, subte, NFC transporte → transporte
    * indumentaria, ropa → indumentaria
    * electrodomésticos, tecnología → electro
    * ferias, mercados, marcas destacadas, universidades, librerías → otro
- pct: integer percent reintegro (5, 10, 20, 25, 30, 40).
- tope: ARS cap as a number. "Sin tope" / "sin tope de reintegro" / article omits tope → null.
  Parse "$6.000 semanales" → 6000; "$15.000 por mes" → 15000.
- tope_period: week | month | ticket | day. If tope is null, set tope_period to null.
  Default to "week" when the article says "semanal(es)" and "month" when it says
  "mensual(es)" / "por mes".
- valid_days: array of ISO weekday numbers 0-6 (Sunday=0, Monday=1, ..., Saturday=6).
    * "los días miércoles" → [3]
    * "lunes a viernes" → [1,2,3,4,5]
    * "sábados y domingos" / "fines de semana" / "fin de semana" → [0,6]
    * "todos los días" / "diario" / "durante toda la semana" → [0,1,2,3,4,5,6]
    * "lunes y martes" → [1,2]
    * "miércoles y jueves" → [3,4]
- valid_regions: Cuenta DNI promos apply in Buenos Aires province → ["AR-B"].
- valid_from: YYYY-MM-DD. Use the first day of the article's declared month, or
  "2026-04-01" as a default if ambiguous.
- valid_to: YYYY-MM-DD. Use the last day of the article's declared month, or
  "2026-04-30" as a default if ambiguous.
- requires_min_spend: ARS if the article says "se alcanza con $X en compras" or
  "compra mínima $X". null otherwise.
- issuer_bank: always ["provincia"] (Banco Provincia issues Cuenta DNI).
- wallet: always ["cuentadni"].

Emit ONE entry per distinct promo mentioned. Do NOT merge promos that share a day or a
tope — keep them separate. A "Full YPF fin de semana 25%/$8k" promo and a "Gastronomía
fin de semana 25%/$8k" promo are TWO promos, one per merchant group.`;

// =============================================================================
// LLM-output schema. Tolerant of empty-string tope_period per the MODO-extractor
// convention; normalized to null post-parse.
// =============================================================================
const TopePeriod = z.union([z.enum(['ticket', 'day', 'week', 'month']), z.literal(''), z.null()]);

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
  tope_period: TopePeriod,
  valid_days: z.array(z.number().int().min(0).max(6)),
  valid_regions: z.array(z.string()),
  valid_from: z.string(),
  valid_to: z.string(),
  requires_min_spend: z.number().nullable(),
  issuer_bank: z.array(z.string()).optional(),
  wallet: z.array(z.string()).optional(),
});
type LlmPromo = z.infer<typeof LlmPromo>;

const LlmPayload = z.object({
  promos: z.array(LlmPromo),
});
type LlmPayload = z.infer<typeof LlmPayload>;

// =============================================================================
// Hand-rolled Gemini responseSchema. Same pattern as modo-extract.ts — the
// auto-converter struggles with nullable + enum + optional arrays.
// =============================================================================
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
          valid_to: { type: 'STRING', description: 'YYYY-MM-DD' },
          requires_min_spend: { type: 'NUMBER', nullable: true },
          issuer_bank: { type: 'ARRAY', items: { type: 'STRING' } },
          wallet: { type: 'ARRAY', items: { type: 'STRING' } },
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
          'issuer_bank',
          'wallet',
        ],
      },
    },
  },
  required: ['promos'],
};

// =============================================================================
// Deterministic UUID v5 (SHA-1 namespace) — same helper as MODO. Inlined rather
// than shared to avoid entangling MODO's namespace UUID with ours.
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

/**
 * Deterministic id for a Cuenta DNI promo given (article URL, merchant, pct).
 * See the module header for the rationale behind this tuple.
 */
export function cuentaDniPromoId(source_url: string, merchant: string, pct: number): string {
  const name = `${source_url}#${merchant.trim().toLowerCase()}#${pct}`;
  return uuidV5(name, CUENTADNI_UUID_NAMESPACE);
}

// =============================================================================
// Extraction — public entry point.
// =============================================================================
export interface ExtractCuentaDniPromosArgs {
  source_url: string;
  markdown: string;
  /** Test-only override. When provided, skips the real Gemini call. */
  llmOverride?: (content: string) => Promise<{ data: LlmPayload; usage: GeminiUsage }>;
}

export interface ExtractCuentaDniPromosResult {
  promos: Promo[];
  ids: string[];
  usage: GeminiUsage;
  /** Count of items the LLM emitted that FAILED canonical Promo validation (skipped). */
  rejected_count: number;
  rejected_reasons: string[];
}

export async function extractCuentaDniPromos(
  args: ExtractCuentaDniPromosArgs,
): Promise<ExtractCuentaDniPromosResult> {
  const { source_url, markdown } = args;

  let payload: LlmPayload;
  let usage: GeminiUsage;

  if (args.llmOverride) {
    const r = await args.llmOverride(markdown);
    payload = r.data;
    usage = r.usage;
  } else {
    const r = await extractStructured({
      prompt: `${CUENTADNI_PROMPT}\n\nsource_url: ${source_url}\nwallet: ["cuentadni"]  (always)`,
      content: markdown,
      schema: LlmPayload,
      schemaForModel: GEMINI_RESPONSE_SCHEMA,
      maxOutputTokens: 4096, // more tokens — N promos per call.
    });
    payload = r.data;
    usage = r.usage;
  }

  const now = new Date().toISOString();
  const promos: Promo[] = [];
  const ids: string[] = [];
  const rejected_reasons: string[] = [];

  for (const item of payload.promos) {
    const tope_period = item.tope_period === '' ? null : (item.tope_period ?? null);

    const candidate: Promo = {
      source_id: CUENTADNI_SOURCE_ID,
      source_url,
      merchant: item.merchant,
      category: item.category,
      wallet: ['cuentadni'],
      issuer_bank: item.issuer_bank && item.issuer_bank.length > 0 ? item.issuer_bank : ['provincia'],
      pct: item.pct,
      promo_type: item.pct === 0 ? 'cuotas' : 'cashback',
      tope: item.tope,
      tope_period,
      valid_days: item.valid_days,
      valid_regions: item.valid_regions,
      valid_from: item.valid_from,
      valid_to: item.valid_to,
      requires_min_spend: item.requires_min_spend,
      last_seen_at: now,
    };

    // Canonical Zod gate — reject individual promos that don't match. Do NOT
    // silently coerce garbage through the upsert path.
    const zr = PromoSchema.safeParse(candidate);
    if (!zr.success) {
      const issues = zr.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      rejected_reasons.push(`${item.merchant} (pct=${item.pct}): ${issues}`);
      continue;
    }

    promos.push(zr.data);
    ids.push(cuentaDniPromoId(source_url, item.merchant, item.pct));
  }

  return {
    promos,
    ids,
    usage,
    rejected_count: rejected_reasons.length,
    rejected_reasons,
  };
}
