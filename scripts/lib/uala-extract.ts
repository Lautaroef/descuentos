// Ualá per-merchant detail extractor.
//
// Input: markdown of a Ualá promo detail page
// (https://www.uala.com.ar/promociones/<slug>). These pages use MODO-grade
// fixed-label blocks:
//
//   Días: L M M J V S D            ← icon row (flat in markdown, no active-state)
//   Métodos de pago: QR
//   Tipo de comercio: Físico
//   Válido hasta: Hasta el 30 de abril 2026
//   Tope de reintegro: Sin tope | $N
//   Tiempo de acreditación: En el momento
//   Disponible en: Todo el país | Buenos Aires
//   Términos y condiciones: <full legal text>
//
// Output: exactly one Promo row (kind: 'per-url'). The extractor asks the LLM
// to parse the legal text for the precise valid_days (same MODO trick — the
// "Días" icon row loses state in markdown, so we lean on the legal-text
// "los días sábados 4, 11, 18 y 25 de marzo" phrasing).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

export const UALA_SOURCE_ID = 'uala';
export const UALA_SOURCE_HOST = 'https://www.uala.com.ar';

const UALA_UUID_NAMESPACE = 'ac931e5b-1a2f-54c8-9b2d-4c5e6f7a8b90';

// =============================================================================
// Prompt.
// =============================================================================
export const UALA_PROMPT = `Extract a single Ualá promo detail page into the schema.
The page uses fixed-label blocks: "Días:", "Métodos de pago:", "Tipo de comercio:",
"Válido hasta:", "Tope de reintegro:", "Tiempo de acreditación:", "Disponible en:",
"Términos y condiciones:".

FOR valid_days (MOST IMPORTANT):
  The "Días: L M M J V S D" icon row does NOT carry active-state in markdown.
  DO NOT default to all 7 days. Instead, parse the LEGAL TEXT under "Términos y
  condiciones":
    * "los días sábados" → [6]
    * "los días sábados 4, 11, 18 y 25 de marzo" → [6]
    * "los días martes" → [2]
    * "los días jueves" → [4]
    * "lunes a viernes" → [1,2,3,4,5]
    * "sábados y domingos" / "fines de semana" → [0,6]
    * "todos los días" (legal text, NOT just the icon row) → [0,1,2,3,4,5,6]
  If the legal text has no weekday restriction AND the icon row is the only
  signal, return [0,1,2,3,4,5,6] but include a warning in valid_days_reasoning.

valid_days_reasoning (REQUIRED): quote the exact legal-text fragment that justified
your valid_days choice.

OTHER FIELDS:

- merchant: the heading above the detail (e.g., "Carrefour", "Sportclub",
  "Coderhouse", "Ualá Bis"). Use the page title or the slug normalized.
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro.
    * Carrefour / Coto / Jumbo / super → supermercado
    * Cabify / Uber / taxi / transporte → transporte
    * Farmacity / farmacia → farmacia
    * Sportclub / gym → otro
    * Coderhouse / educación → otro
    * Ualá Bis (merchant POS product) → otro
- pct: integer. "10% Off" → 10. "35% de reintegro" → 35.
- tope: ARS cap. "Tope de reintegro: Sin tope" → null. "Tope de reintegro:
  $N.NNN" → N*1000 or the parsed number.
- tope_period: week | month | ticket | day. Ualá rarely states this explicitly.
  Defaults: tope present and promo is cashback → "month". If tope is null → null.
- valid_regions: "Disponible en: Todo el país" → []. "Buenos Aires" → ["AR-B"].
  "CABA" → ["AR-C"].
- valid_from: YYYY-MM-DD. If legal text names a specific first-sábado, use it;
  else use the first of the current month.
- valid_to: YYYY-MM-DD. Parse "Válido hasta: Hasta el 30 de abril 2026" → 2026-04-30.
  If absent, last day of current month.
- requires_min_spend: ARS if legal text says "compra mínima $N"; null otherwise.
- issuer_bank: always ["uala"].
- wallet: always ["uala"].
- promo_type: "cashback" for reintegro, "mixed" for descuento/off, "cuotas" for
  cuotas-sin-interés (pct=0).

Emit EXACTLY ONE object (per-url source; one slug = one promo).`;

// =============================================================================
// LLM-output schema.
// =============================================================================
const LlmUalaPayload = z.object({
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
  valid_days_reasoning: z.string().optional(),
  valid_regions: z.array(z.string()),
  valid_from: z.string(),
  valid_to: z.string(),
  requires_min_spend: z.number().nullable(),
  issuer_bank: z.array(z.string()).optional(),
  wallet: z.array(z.string()).optional(),
  promo_type: z.enum(['cashback', 'cuotas', 'mixed']),
});
type LlmUalaPayload = z.infer<typeof LlmUalaPayload>;

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
    'valid_days_reasoning',
    'valid_regions',
    'valid_from',
    'valid_to',
    'requires_min_spend',
    'issuer_bank',
    'wallet',
    'promo_type',
  ],
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

export function ualaSourceUrl(slug: string): string {
  return `${UALA_SOURCE_HOST}/promociones/${slug}`;
}

export function ualaPromoId(slug: string): string {
  return uuidV5(ualaSourceUrl(slug), UALA_UUID_NAMESPACE);
}

// =============================================================================
// Extraction.
// =============================================================================
export interface ExtractUalaPromoArgs {
  slug: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmUalaPayload; usage: GeminiUsage }>;
}

export interface ExtractUalaPromoResult {
  promo: Promo;
  id: string;
  usage: GeminiUsage;
}

export async function extractUalaPromo(
  args: ExtractUalaPromoArgs,
): Promise<ExtractUalaPromoResult> {
  const { slug, markdown } = args;
  const source_url = ualaSourceUrl(slug);

  let llm: LlmUalaPayload;
  let usage: GeminiUsage;
  if (args.llmOverride) {
    const r = await args.llmOverride(markdown);
    llm = r.data;
    usage = r.usage;
  } else {
    const r = await extractStructured({
      prompt: `${UALA_PROMPT}\n\nsource_url: ${source_url}\nslug: ${slug}\nwallet: ["uala"]  (always)`,
      content: markdown,
      schema: LlmUalaPayload,
      schemaForModel: GEMINI_RESPONSE_SCHEMA,
      maxOutputTokens: 2048,
    });
    llm = r.data;
    usage = r.usage;
  }

  const tope_period = llm.tope_period === '' ? null : (llm.tope_period ?? null);

  const now = new Date().toISOString();
  const candidate: Promo = {
    source_id: UALA_SOURCE_ID,
    source_url,
    merchant: llm.merchant,
    category: llm.category,
    wallet: ['uala'],
    issuer_bank: llm.issuer_bank && llm.issuer_bank.length > 0 ? llm.issuer_bank : ['uala'],
    pct: llm.pct,
    promo_type: llm.promo_type,
    tope: llm.tope,
    tope_period,
    valid_days: llm.valid_days,
    valid_regions: llm.valid_regions ?? [],
    valid_from: llm.valid_from,
    valid_to: llm.valid_to,
    requires_min_spend: llm.requires_min_spend,
    last_seen_at: now,
  };

  const zr = PromoSchema.safeParse(candidate);
  if (!zr.success) {
    const issues = zr.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Ualá ${slug} failed canonical Promo validation: ${issues}`);
  }

  return {
    promo: zr.data,
    id: ualaPromoId(slug),
    usage,
  };
}
