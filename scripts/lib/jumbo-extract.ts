// Jumbo cross-bank catalog extractor.
//
// Two surfaces:
//   1. /descuentos-del-dia — bank promos with day filter (defaults to today's
//      weekday in the scrape). Each block: bank logo + "NN% Dto." or
//      "N cuotas sin interés" + legal.
//   2. /jumbo-al-cien      — Jumbo's own "pesoscheck" cupon program. One
//      marketing block per monthly cycle with emission window + canje window.
//      Treated as ONE promo row per cycle with `wallet: ['jumbo_mas']`.
//
// Differentiator: Jumbo al 100 is Jumbo's own-cupon program — PromoArg does
// not source this, and it's a bona-fide 100% reintegro on selected products
// for Jumbo+ members. Even though it has monthly slug rotation in emission /
// canje dates, the URL path (`/jumbo-al-cien`) is stable.
//
// Monthly rotation: the emission (06–08/03/2026 etc.) and canje windows rotate
// monthly on the SAME URL. Re-running the ingest picks up the new cycle with
// fresh valid_from/valid_to; the deterministic id does NOT include dates, so
// the row updates in place — intended behavior.
import {
  extractSupermarketPromos,
  supermarketPromoId,
  type ExtractSupermarketResult,
  type LlmSuperPayload,
} from './supermarket-extract.js';
import type { GeminiUsage } from './gemini.js';

export const JUMBO_SOURCE_ID = 'jumbo-descuentos';

export const JUMBO_DESCUENTOS_PROMPT = `You extract Jumbo supermarket cross-bank
promos from the scraped markdown of /descuentos-del-dia. Emit ONE object per
distinct promo block.

Jumbo's page layout:
  - Top nav of day filter ("Lunes", "Martes", ..., "Sábado") + "Por banco" + "Cenco Pay" + "Planes de Financiación"
  - Each block: bank/wallet logo + "#### NN% Dto." or "#### N cuotas sin interés" + day / exclusive-online caveats + legal body
  - The Jumbo "Cenco Pay" tab surfaces Cencopay's own promos (tarjeta de crédito física CENCOPAY).

Fields (required):

- day_phrase: verbatim ("Todos los días" / "Sábados" / "Viernes, Sábado y Domingo" /
  "Jueves, Viernes, Sábado y Domingo" / "Lunes y Miércoles" / etc.) from the legal
  text.
- valid_days: ISO 0-6 mapping as in COTO_EXTRACTION_PROMPT.
    * "Todos los días" / (no day clause) → [0,1,2,3,4,5,6]
    * "Sábados" → [6]
    * "Jueves, Viernes, Sábado y Domingo" → [0,4,5,6]
    * "Viernes, Sábado y Domingo" → [0,5,6]
    * "Lunes y Miércoles" → [1,3]
- pct: integer. For pure cuotas rows, use 0.
- promo_type: "cashback" for percent-off; "cuotas" for cuotas-only (pct=0).
- tope: "$20.000/mes" → 20000. "TOPE POR MES $25.000" → 25000. "Sin tope" → null.
  Cuotas rows generally have no tope → null.
- tope_period: week | month | ticket | day | null. "POR MES" → month. "semanal" → week.
- cuotas_count: REQUIRED for promo_type="cuotas". Integer number of installments
  ("3 cuotas sin interés" → 3, "12 cuotas" → 12, "24 cuotas" → 24). If a block
  lists MULTIPLE counts in one block ("6 y 12 cuotas sin interés") use the
  HIGHER count (12 here) since that's the headline value a user cares about.
  null for cashback/mixed rows. This disambiguates same-bank/day cuotas tiers
  (Cencopay 3/6/12/18/24 cuotas — previously collapsed to a single row under
  the v1 id scheme; fixed in v2 as of 2026-04-23).
- merchant: always "Jumbo".
- category: always "supermercado".
- issuer_bank: lowercased short names. Examples from Jumbo: galicia, macro,
  santander, patagonia, nacion, comafi, cencopay (Cenco Pay = Cencosud's own
  card), naranjax, supervielle, ciudad.
    * Visa/Mastercard brand-only blocks (no bank named) → issuer_bank: []
- wallet: ["mercadopago"] for Mercado Pago QR references, ["modo"] for MODO.
  [] for bank-card-only rows.
- card_brand: optional; use ["visa"], ["mastercard"], ["amex"], or combinations.
  Omit if not explicit.
- valid_regions: [] (national — Jumbo is a Cencosud chain with nationwide coverage).
- valid_from: "DESDE EL DD/MM/YYYY" → YYYY-MM-DD. If absent, use "2026-04-01".
- valid_to: "AL DD/MM/YYYY" or "HASTA 30/04/2026" → YYYY-MM-DD. Default "2026-04-30".
- requires_min_spend: null (Jumbo catalogs rarely stipulate min spend on bank promos).
- notes: caveats like "Exclusivo Online" (short, optional).

IMPORTANT:
  - Distinct blocks with the same bank + day but different scope (e.g., "Patagonia
    30% toda la compra $20k/mes" vs "Patagonia 35% supermercado $25k/mes") are
    TWO separate promos.
  - Jumbo frequently shows "3 cuotas", "6 cuotas", "12 cuotas", "18 cuotas", "24 cuotas"
    rows side-by-side. Each is a distinct promo (pct=0, promo_type='cuotas').
  - Do NOT emit rows for the top-nav filter buttons ("Por día", "Por banco", etc).`;

export const JUMBO_ALCIEN_PROMPT = `You extract the Jumbo al 100 pesoscheck promo
from the scraped markdown. This page describes ONE cupon-based promo per monthly
cycle. Emit ONE object (the promos array will have a single entry).

Fields:

- day_phrase: "Del DD/MM al DD/MM" derived from the emission window (e.g., "Del 06/03 al 08/03").
- valid_days: derive from the emission window weekdays ("Viernes 06 al Domingo 08" → [0,5,6]).
- pct: 100 — the headline reintegro label for the TOP-tier pesoscheck products.
- promo_type: "cashback".
- tope: null. The promo is tope-less in the headline ("hasta el 100% de tu compra")
  but capped functionally at "6 unidades por SKU" and "10 cupones por compra" —
  surface those as notes, not as a numeric tope.
- tope_period: null (since tope is null).
- merchant: "Jumbo".
- category: "supermercado".
- issuer_bank: [].
- wallet: ["jumbo_mas"]. This is Jumbo's own-cupon / Jumbo+ membership program.
- valid_regions: [] (national, except Madero/Arenales/Comodoro Rivadavia — surface in notes).
- valid_from: first day of emission window (YYYY-MM-DD). E.g., "Viernes 06 al Domingo 08 de Marzo del 2026" → "2026-03-06".
- valid_to: last day of canje window. E.g., "del 13 al 15 de Marzo de 2026" → "2026-03-15".
- requires_min_spend: null.
- notes: short summary of "Máx 10 cupones por compra; 6 unidades por SKU; no aplica electro/indumentaria; requiere Jumbo+".

If the page doesn't describe a current cycle (e.g., between cycles with only the
historical text), STILL emit the most recently described cycle based on the
legal footer dates. Do NOT fabricate dates — pull them from the legal body.`;

export interface ExtractJumboArgs {
  source_url: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmSuperPayload; usage: GeminiUsage }>;
}

export async function extractJumboPromos(args: ExtractJumboArgs): Promise<ExtractSupermarketResult> {
  // Prompt selection: jumbo-al-cien URLs use the single-row cupon prompt; the
  // /descuentos-del-dia URL uses the multi-block cross-bank prompt.
  const isAlCien = args.source_url.includes('jumbo-al-cien');
  const prompt = isAlCien ? JUMBO_ALCIEN_PROMPT : JUMBO_DESCUENTOS_PROMPT;

  return extractSupermarketPromos({
    source_id: JUMBO_SOURCE_ID,
    source_url: args.source_url,
    markdown: args.markdown,
    prompt,
    default_regions: [],
    llmOverride: args.llmOverride,
    // jumbo-al-cien is tiny, descuentos-del-dia is ~20 blocks → default 6k is fine.
  });
}

export { supermarketPromoId as jumboPromoId } from './supermarket-extract.js';
