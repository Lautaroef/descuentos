// Naranja X /promociones (+ sub-hubs) extractor.
//
// Input: markdown from one of the Naranja X hub pages:
//   - https://www.naranjax.com/promociones                        — general hub
//   - https://www.naranjax.com/promociones/SUPERMERCADOS_categoria — supermarkets
//   - https://www.naranjax.com/promociones-amba                    — AMBA-region
//   - https://www.naranjax.com/promos-relampago                    — flash deals
//   - https://www.naranjax.com/smartes                             — monthly sale days
//   - https://www.naranjax.com/pagar-transporte                    — transporte
//
// Each hub is rendered Next.js-ish SPA (Firecrawl resolves it with waitFor=6000).
// Each card exposes: headline (pct + cuotas), optional `Tope semanal hasta $N`,
// day phrase, and a set of payment-medium icons.
//
// Output: one canonical `Promo` per card. `kind: 'bulk'` — one URL, many Promos.
// Same URL may appear on multiple hubs; deterministic UUID v5 dedups on upsert.
//
// Canonical-id strategy:
//   Row id = uuidV5(`${source_url}#${merchant}#${pct}#${days-label}`, NARANJAX_NAMESPACE)
//
// We tuple on `source_url` (NOT a cross-hub canonical) so the same promo listed on
// two hubs keeps separate provenance rows. Phase 4 dedup collapses by canonical
// content hash later. This mirrors the Cuenta DNI policy.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

export const NARANJAX_SOURCE_ID = 'naranjax';

// Default hubs to scrape. Order matters only for logging — the runner processes
// concurrently and dedups via UUID v5 ids on upsert.
export const NARANJAX_HUB_URLS = [
  'https://www.naranjax.com/promociones',
  'https://www.naranjax.com/promociones/SUPERMERCADOS_categoria',
  'https://www.naranjax.com/promociones-amba',
  'https://www.naranjax.com/promos-relampago',
  'https://www.naranjax.com/smartes',
];

// UUID v5 namespace — fixed once.
const NARANJAX_UUID_NAMESPACE = 'a2c5f14b-9d02-5e11-bf3e-7a8b9c1d2e3f';

// =============================================================================
// Prompt.
// =============================================================================
export const NARANJAX_PROMPT = `You extract Naranja X promos from a hub catalog page.
Each card shows a headline (e.g. "Hasta 25% OFF" or "14 cuotas cero interés" or
"Hasta 10% off y 6 cuotas cero interés"), a day phrase ("Todos los martes",
"Del 18 al 25 de abril", "Todos los días", "Días seleccionados"), a merchant
heading ("En supermercados", "Naldo", "Aerolíneas Argentinas", ...), optional
"Tope semanal hasta $N" line, and a set of payment-medium icons (Débito /
Crédito / Dinero en cuenta / QR / NFC).

Output: { "promos": [ ... ] }. One entry per card. Fields:

- merchant: short label. "En supermercados" → "Supermercados". For named
  merchants use the name verbatim ("Naldo", "Aerolíneas Argentinas", "Vea",
  "Coto", etc.).
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro.
    * supermercado → Vea/Jumbo/Disco/Carrefour/Coto/Changomas/La Anonima/Dia/
      Makro/Yaguar/Diarco/Atomo/Dobro/Supermercado*
    * transporte → transporte / subte / colectivo / Aerolíneas / viajes / El Norte /
      Flecha Bus / Chevallier / taxi
    * combustible → YPF / Axion / Shell / Puma / Gas
    * gastronomia → restaurantes / fast food / heladerías
    * indumentaria → Mimo / Seven Sport / Exit / Showsport / moda
    * electro → Cetrogar / Musimundo / Megatone / Fravega / Samsung / Whirlpool /
      Naldo / Casa del Audio / Coppel
    * otro → hoteles del caribe / hogar y deco / Shopgallery / etc.
- pct: integer. "Hasta 25% OFF" → 25. "25% off y Plan Zeta" → 25. Cuotas-only
  cards (no percent) → 0.
- tope: ARS cap. "Tope semanal hasta $12.000" → 12000. Card with no tope line → null.
- tope_period: "Tope semanal" → "week". "Tope mensual" → "month". "Tope por
  ticket" → "ticket". If tope is null → null.
- valid_days:
    * "Todos los días" / "Todos los dias" → [0,1,2,3,4,5,6]
    * "Todos los martes" / "Los Martes" / "Los martes" → [2]
    * "Todos los miércoles" / "Los miércoles" → [3]
    * "Lunes" → [1]; "Jueves" → [4]; "Viernes" → [5]; "Sábado" → [6]; "Domingo" → [0]
    * "Del DD al DD de <mes>" (explicit window, not a weekday pattern) → [0,1,2,3,4,5,6]
    * "Días seleccionados" (merchant has multiple days in T&Cs but the card
      doesn't say which) → [2] (default to Tuesdays — the Plan Turbo/Épico
      super deal is always martes) ONLY IF the category is supermercado or
      combustible; otherwise leave [0,1,2,3,4,5,6].
    * "Hasta el DD de <mes>" (expiration, no weekday restriction) → [0,1,2,3,4,5,6]
- valid_regions: hub page → []. If the page is /promociones-amba → ["AR-C","AR-B"]
  (CABA + Buenos Aires province).
- valid_from: first day of current month (YYYY-MM-01). If the card says
  "Del DD al DD de <mes>" parse that window exactly.
- valid_to: last day of current month (YYYY-MM-LL), or card's "Hasta el DD de
  <mes>" / "Del ... al DD de <mes>" end date.
- requires_min_spend: null unless the card/text mentions "compra mínima $N" (rare).
- promo_type: "cuotas" when the headline is cuotas-only (pct=0). "mixed" when
  headline combines off + cuotas. "cashback" when it's tope-based cashback.
- medios: array of payment medium strings observed on the card. Canonical values:
  "debito" | "credito" | "dinero_en_cuenta" | "qr" | "nfc".
  Used downstream; optional.

Emit ONE entry per card. Do NOT merge cards under the same merchant.`;

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
  valid_to: z.string(),
  requires_min_spend: z.number().nullable(),
  promo_type: z.enum(['cashback', 'cuotas', 'mixed']),
  medios: z.array(z.string()).optional(),
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
          valid_to: { type: 'STRING', description: 'YYYY-MM-DD' },
          requires_min_spend: { type: 'NUMBER', nullable: true },
          promo_type: { type: 'STRING', enum: ['cashback', 'cuotas', 'mixed'] },
          medios: { type: 'ARRAY', items: { type: 'STRING' } },
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
          'medios',
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

/**
 * Deterministic id for a Naranja X promo.
 * Tuple: (source_url, merchant, pct, days-label).
 */
export function naranjaxPromoId(
  source_url: string,
  merchant: string,
  pct: number,
  valid_days: number[],
): string {
  const daysLabel = [...valid_days].sort((a, b) => a - b).join(',');
  const name = `${source_url}#${merchant.trim().toLowerCase()}#${pct}#${daysLabel}`;
  return uuidV5(name, NARANJAX_UUID_NAMESPACE);
}

// =============================================================================
// Extraction.
// =============================================================================
export interface ExtractNaranjaxPromosArgs {
  source_url: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmPayload; usage: GeminiUsage }>;
}

export interface ExtractNaranjaxPromosResult {
  promos: Promo[];
  ids: string[];
  usage: GeminiUsage;
  rejected_count: number;
  rejected_reasons: string[];
}

export async function extractNaranjaxPromos(
  args: ExtractNaranjaxPromosArgs,
): Promise<ExtractNaranjaxPromosResult> {
  const { source_url, markdown } = args;

  let payload: LlmPayload;
  let usage: GeminiUsage;
  if (args.llmOverride) {
    const r = await args.llmOverride(markdown);
    payload = r.data;
    usage = r.usage;
  } else {
    const r = await extractStructured({
      prompt: `${NARANJAX_PROMPT}\n\nsource_url: ${source_url}\nwallet: ["naranjax"]  (always)`,
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

  for (const item of payload.promos) {
    const tope_period = item.tope_period === '' ? null : (item.tope_period ?? null);

    const id = naranjaxPromoId(source_url, item.merchant, item.pct, item.valid_days);
    if (seenIds.has(id)) continue;

    const candidate: Promo = {
      source_id: NARANJAX_SOURCE_ID,
      source_url,
      merchant: item.merchant,
      category: item.category,
      wallet: ['naranjax'],
      issuer_bank: ['naranjax'],
      pct: item.pct,
      promo_type: item.promo_type,
      tope: item.tope,
      tope_period,
      valid_days: item.valid_days,
      valid_regions: item.valid_regions ?? [],
      valid_from: item.valid_from,
      valid_to: item.valid_to,
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
