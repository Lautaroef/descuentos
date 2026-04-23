// Brubank /beneficios extractor.
//
// Input: the markdown of https://brubank.com/beneficios — a fully-rendered Webflow
// catalog (~50 promo cards) grouped by plan tier (Plan Ultra / Plan Plus / Plan
// One) plus a top-level "cuotas sin interés" ribbon.
//
// Output: one canonical `Promo` row per card. One URL yields many Promos, so this
// is a `bulk` source (see docs/sources.md).
//
// Canonical-id strategy:
//
//   Row id = uuidV5(`${source_url}#${plan}#${merchant}#${pct}#${day_label}`, BRUBANK_NAMESPACE)
//
// Rationale:
//   - `plan` (one/plus/ultra) distinguishes tier-specific variants of the same
//     merchant (e.g., Axion Ultra 30% vs Axion Plus 20% vs Axion One 10%).
//   - `day_label` handles the rare case where a single plan offers the same
//     merchant on different days at different rates (not observed in this corpus
//     but defensive — the Webflow page mixes "Martes" vs "Todos los días" cards).
//   - `pct` handles the rare dual-rate card (e.g., the "descuento" vs
//     "reintegro" variants on the same plan — Freddo, Rapanui, Havanna have
//     plan-split cards with different pct per plan).
//
// Plan-tier modelling decision (deliberate):
//   We encode plan tier in `issuer_bank` as `['brubank-one']` / `['brubank-plus']`
//   / `['brubank-ultra']`. This keeps the schema untouched (no migration needed)
//   while preserving the required-plan signal for downstream filtering. See
//   docs/sources/brubank.md for the full rationale and the alternative path
//   (a dedicated `required_plan` column) we did NOT take.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

export const BRUBANK_SOURCE_ID = 'brubank';
export const BRUBANK_SOURCE_URL = 'https://brubank.com/beneficios';

// UUID v5 namespace — fixed once; committed so upserts stay stable.
const BRUBANK_UUID_NAMESPACE = 'b1b2b3b4-b5b6-5b7b-8b9b-abbcbdbebfb0';

// =============================================================================
// Prompt — tuned for Brubank's Webflow structure.
// =============================================================================
export const BRUBANK_PROMPT = `You extract Brubank promos from a catalog page. The page has
three sections — Plan Ultra, Plan Plus, Plan One — each listing merchant cards with a
percent-off headline, an optional tope, and a valid-days phrase.

Output a JSON object: { "promos": [ ... ] } with ONE entry per merchant card. Fields:

- plan: "ultra" | "plus" | "one". Which plan tier section the card is under. Do NOT
  copy the card's inner text — use the surrounding section heading (the page groups
  cards into Ultra/Plus/One bands). Cuotas-sin-interés cards at the TOP of the page
  (before the first plan band) are available to ALL plans — emit plan="all" for
  those; the adapter fans them out into three rows.
- merchant: merchant name exactly as shown ("Axion Energy", "Burger King", "Cabify",
  "App YPF", "Le Pain Quotidien", "Kusta Barber", etc.). Preserve casing.
- category: supermercado | farmacia | gastronomia | combustible | transporte |
  indumentaria | electro | otro. Map:
    * Axion Energy, Shell, YPF, App YPF → combustible
    * Burger King, Freddo, Havanna, Le Pain Quotidien, Rapanui, Cerini, Molina,
      Deniro, The Food Market, Vuena, LPQ, Cervelar → gastronomia
    * Farmacity, Biomac, Farmalife, Simplicity (chain), Mundo Bienestar → farmacia
    * Cabify → transporte
    * Eyelit, Get The Look, ACF, Nic, Simplicity (if labeled indumentaria), Mimo,
      Seven Sport, Exit, Showsport, Mala Peluquería, Kusta Barber → indumentaria
    * Samsung, JBL, Naldo, Cetrogar, Musimundo, Fravega, Megatone, Whirlpool,
      Educación IT, Baires IT, CUI, Multipoint, BrAgro → electro
    * every other retailer → otro
- pct: integer percent. "30% de reintegro" → 30. "45% de descuento" → 45.
  Cuotas-sin-interés cards ("3 cuotas sin interés", "Hasta 12 cuotas") → pct=0
  (we flag these as promo_type='cuotas' downstream).
- tope: ARS cap as a number. "Tope de reintegro: $6.000" → 6000. "Tope de reintegro:
  $8.000" → 8000. If the card does NOT show a tope line → null.
- tope_period: week | month | ticket | day. Brubank cards don't state a period
  explicitly; use "month" when tope is present (Brubank's T&Cs are uniformly
  per-month). When tope is null, set tope_period to null.
- valid_days: array of ISO weekday numbers (Sun=0, Mon=1, ..., Sat=6). Parse the
  day phrase:
    * "Todos los días" → [0,1,2,3,4,5,6]
    * "Todos los lunes" / "Lunes" → [1]
    * "Todos los martes" / "Martes" → [2]
    * "Miércoles" → [3]
    * "Jueves" → [4]
    * "Viernes" → [5]
    * "Sábado" / "Sábados" → [6]
    * "Domingo" → [0]
    * "Lunes y viernes" → [1,5]
    * "Domingo y lunes" → [0,1]
    * "Viernes, sábados y domingos" → [0,5,6]
    * "Jueves a domingos" → [0,4,5,6]
    * "Lunes a viernes" → [1,2,3,4,5]
- valid_regions: always [] (Brubank is national).
- valid_from: first day of the current month (YYYY-MM-01). Brubank cards don't
  declare a start date; the scraping month is a defensible floor.
- valid_to: **null by default**. Emit null UNLESS the page explicitly states an
  end date for THIS card in one of these forms: "Vigencia hasta DD/MM/YY",
  "Válido hasta DD/MM/YY", "Hasta el DD/MM/YY", "Hasta el DD de <mes>",
  "Vigencia Del DD/MM/YY al DD/MM/YY". If NONE of those markers appear for a
  card, valid_to MUST be null. Do NOT default to end-of-month. Do NOT infer a
  date from the scraping month. Do NOT reuse a legal-text phrase like "durante
  el mes en curso" as a date — that is an open-ended indicator, still null.
  Brubank's Webflow catalog is rolling; almost every card is null.
- requires_min_spend: null (Brubank catalog cards never show this).
- promo_type: "cashback" for "reintegro" cards, "mixed" for "descuento" cards (in
  Brubank lingo "descuento" = direct discount, "reintegro" = cashback); "cuotas"
  for cuotas-sin-interés cards.
- cuotas: integer number of cuotas-sin-interés when the headline says "N cuotas sin
  interés" or "Hasta N cuotas"; otherwise null. (Used downstream to populate
  variants for the cuotas-only cards.)

Emit ONE entry per card. Do NOT merge cards across plans — the same merchant under
Ultra / Plus / One are THREE separate promos.`;

// =============================================================================
// LLM-output schema.
// =============================================================================
const LlmBrubankPromo = z.object({
  plan: z.enum(['ultra', 'plus', 'one', 'all']),
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
  cuotas: z.number().int().min(0).nullable().optional(),
});
type LlmBrubankPromo = z.infer<typeof LlmBrubankPromo>;

const LlmPayload = z.object({ promos: z.array(LlmBrubankPromo) });
type LlmPayload = z.infer<typeof LlmPayload>;

// Hand-rolled Gemini responseSchema — auto-conversion stumbles on the nullable+enum
// combination on `tope_period` and the optional-nullable `cuotas`.
const GEMINI_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    promos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          plan: { type: 'STRING', enum: ['ultra', 'plus', 'one', 'all'] },
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
          cuotas: { type: 'INTEGER', nullable: true },
        },
        required: [
          'plan',
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
          'plan',
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
          'cuotas',
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
 * Deterministic id for a Brubank promo.
 * Tuple: (source_url, plan, merchant, pct, valid_days-label).
 */
export function brubankPromoId(
  source_url: string,
  plan: string,
  merchant: string,
  pct: number,
  valid_days: number[],
): string {
  const daysLabel = [...valid_days].sort((a, b) => a - b).join(',');
  const name = `${source_url}#${plan}#${merchant.trim().toLowerCase()}#${pct}#${daysLabel}`;
  return uuidV5(name, BRUBANK_UUID_NAMESPACE);
}

/**
 * Map a plan tier label to the issuer_bank encoding we use.
 * `plan="all"` is expanded into three rows (one per tier) by the caller.
 */
function issuerBankForPlan(plan: 'ultra' | 'plus' | 'one'): string[] {
  return [`brubank-${plan}`];
}

// =============================================================================
// valid_to invariant — evidence-based guard.
//
// Brubank's /beneficios page is a rolling Webflow catalog of ongoing
// benefits; almost every card has NO declared vigencia. When the LLM
// hallucinates an end-of-month date, the `valid_to >= today` gate in
// src/lib/queries.ts hides every promo the day the scraping month rolls
// over — surfacing as "0 of 85 fresh Brubank rows visible" in production
// on 2026-04-18.
//
// Guard policy (Option B, evidence-based):
//   - If the source markdown does NOT contain any explicit end-date marker,
//     force valid_to=null on every row — the LLM is not authoritative over
//     the source.
//   - If the markdown DOES contain end-date markers, trust the LLM's
//     per-row decision: null stays null, a date stays a date. The LLM is
//     the best judge of which card the marker belongs to.
//
// This trades a small amount of recall (if Brubank ever publishes a
// vigencia image-only on a single card, we'd miss it) for a hard floor
// against the hallucination class of bug. The alternative (Option A,
// unconditional null) loses too much signal; Option C (prompt-only trust)
// is what we had before, and it was wrong.
//
// Source-specific: only applies to Brubank extractions. MODO/Cuenta DNI
// have dedicated vigencia UI blocks and a different extraction discipline.
// =============================================================================

const BRUBANK_END_DATE_MARKER = new RegExp(
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
  return BRUBANK_END_DATE_MARKER.test(markdown);
}

// =============================================================================
// Extraction — public entry point.
// =============================================================================
export interface ExtractBrubankPromosArgs {
  source_url: string;
  markdown: string;
  /** Test-only override. Returns a fixed payload without calling Gemini. */
  llmOverride?: (content: string) => Promise<{ data: LlmPayload; usage: GeminiUsage }>;
}

export interface ExtractBrubankPromosResult {
  promos: Promo[];
  ids: string[];
  usage: GeminiUsage;
  rejected_count: number;
  rejected_reasons: string[];
}

export async function extractBrubankPromos(
  args: ExtractBrubankPromosArgs,
): Promise<ExtractBrubankPromosResult> {
  const { source_url, markdown } = args;

  let payload: LlmPayload;
  let usage: GeminiUsage;
  if (args.llmOverride) {
    const r = await args.llmOverride(markdown);
    payload = r.data;
    usage = r.usage;
  } else {
    const r = await extractStructured({
      prompt: `${BRUBANK_PROMPT}\n\nsource_url: ${source_url}\nwallet: ["brubank"]  (always)`,
      content: markdown,
      schema: LlmPayload,
      schemaForModel: GEMINI_RESPONSE_SCHEMA,
      // 85-card catalog. Bumped from 8192 → 16384 on 2026-04-18 after the
      // `valid_to: null` change widened the JSON envelope enough to trip
      // truncation mid-response. See docs/sources/brubank.md for details.
      maxOutputTokens: 16384,
    });
    payload = r.data;
    usage = r.usage;
  }

  const now = new Date().toISOString();
  const promos: Promo[] = [];
  const ids: string[] = [];
  const rejected_reasons: string[] = [];
  const seenIds = new Set<string>();

  // Evidence-based valid_to guard. If the source markdown has NO explicit
  // end-date marker, the LLM has nothing to anchor a valid_to on; any date
  // it emits is a hallucination. Force null across the whole payload.
  // If markers ARE present, we trust the LLM's per-row decision.
  const pageDeclaresEndDate = markdownDeclaresEndDate(markdown);

  for (const item of payload.promos) {
    const tope_period = item.tope_period === '' ? null : (item.tope_period ?? null);
    const plansToEmit: Array<'ultra' | 'plus' | 'one'> =
      item.plan === 'all' ? ['ultra', 'plus', 'one'] : [item.plan];

    // The LLM's valid_to is only trustworthy if the page actually has
    // vigencia language. When the page is a rolling catalog (no markers),
    // force null regardless of what the model emitted.
    const valid_to = pageDeclaresEndDate ? (item.valid_to ?? null) : null;

    for (const plan of plansToEmit) {
      const id = brubankPromoId(source_url, plan, item.merchant, item.pct, item.valid_days);
      // Guard: skip duplicate ids within one extraction (e.g., model emitted the same
      // card twice). The DB upsert is idempotent, but double-emitting inflates counts.
      if (seenIds.has(id)) continue;

      const candidate: Promo = {
        source_id: BRUBANK_SOURCE_ID,
        source_url,
        merchant: item.merchant,
        category: item.category,
        wallet: ['brubank'],
        issuer_bank: issuerBankForPlan(plan),
        pct: item.pct,
        promo_type: item.promo_type,
        tope: item.tope,
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
        rejected_reasons.push(
          `${plan}/${item.merchant} (pct=${item.pct}): ${issues}`,
        );
        continue;
      }

      promos.push(zr.data);
      ids.push(id);
      seenIds.add(id);
    }
  }

  return {
    promos,
    ids,
    usage,
    rejected_count: rejected_reasons.length,
    rejected_reasons,
  };
}
