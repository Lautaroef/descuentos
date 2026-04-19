// Coto cross-bank catalog extractor.
//
// Input: markdown of coto.com.ar/descuentos/ OR cotodigital.com.ar/sitios/cdigi/descuentos.
// Both URLs surface the same kind of structured catalog: day-phrase headers +
// bank/wallet logo + "NN% descuento" or "NN cuotas sin interés" + tope + legal.
//
// Output: `Promo[]` where each promo is one distinct (day, bank, pct, promo_type)
// combination. Cross-bank universal blocks (rare on Coto, common on Carrefour)
// become ONE promo row with array-valued `wallet`/`issuer_bank`.
//
// Differentiator: Coto's catalog includes the **Comunidad Coto** own-cupon
// (15% Miércoles sin tope) which PromoArg does NOT source — we surface it via
// `wallet: ['comunidad_coto']`.
import {
  extractSupermarketPromos,
  supermarketPromoId,
  type ExtractSupermarketResult,
  type LlmSuperPayload,
} from './supermarket-extract.js';
import type { GeminiUsage } from './gemini.js';

export const COTO_SOURCE_ID = 'coto-descuentos';

export const COTO_EXTRACTION_PROMPT = `You extract Coto supermarket cross-bank
promos from the scraped markdown of its /descuentos page. The page is ONE
catalog listing many promos. Emit ONE object per distinct promo block.

A "block" is a triple: day phrase + bank/wallet logo + headline pct or cuotas.
Distinct blocks for the same bank on the same day but different pct (e.g.,
Credicoop 30% general vs 40% sueldo) are SEPARATE promos.

Fields (required):

- day_phrase: copy the verbatim phrase ("Lunes", "De Lunes a Domingo",
  "Lunes, Sábado y Domingo", "Sábado y Domingo", "Miércoles", "Del Sábado
  18/04 al Lunes 20/04", etc.).
- valid_days: array of ISO weekday numbers 0-6 (Sunday=0, Monday=1, ..., Saturday=6).
  Mappings:
    * "Lunes" / "Todos los Lunes" → [1]
    * "Martes" → [2]
    * "Miércoles" → [3]
    * "Jueves" → [4]
    * "Viernes" → [5]
    * "Sábado" → [6]
    * "Domingo" → [0]
    * "De Lunes a Domingo" / "todos los días" → [0,1,2,3,4,5,6]
    * "Sábado y Domingo" / "fin de semana" → [0,6]
    * "De Lunes a Jueves" → [1,2,3,4]
    * "Lunes, Sábado y Domingo" → [0,1,6]
    * "Todos los Martes y Jueves" → [2,4]
    * Range "Del Sábado 18/04 al Lunes 20/04" → [0,1,6]
- pct: integer percent. For "cuotas sin interés" rows where no pct is mentioned,
  use 0.
- promo_type: "cashback" for percent-off promos; "cuotas" for cuotas-only (pct=0);
  "mixed" only if the block genuinely says "N% OFF + N cuotas".
- tope: ARS cap. "sin tope" / "sin límite" / "Sin límite de reintegro" → null.
  "$15.000 semanal" → 15000. "$25.000 por mes" → 25000. If multiple topes
  appear (e.g., "Cartera general $13.000, Segmento Unico $18.000"), take the
  LOWER (most conservative) tope.
- tope_period: ticket | day | week | month. "semanal" → week; "por mes" / "mensual"
  → month; "p/ transacción" / "por transacción" → ticket. If tope is null, set
  tope_period to null.
- merchant: always "Coto".
- category: always "supermercado".
- issuer_bank: lowercased short names of banks. From logo captions / legal text.
  Examples: credicoop, ciudad, icbc, nacion, naranja, naranjax, macro, galicia,
  columbia, patagonia, supervielle, santafe, sanjuan, santacruz, entrerios, tci,
  comafi, ciudadaniaporteña (→ "ciudadaniaportena"), anses, comunidad, mercadopago,
  bancosregionales (if "Santa Cruz + San Juan + Entre Ríos + Santa Fe" appear
  together under one block, emit all four separately: ["santacruz","sanjuan","entrerios","santafe"]).
  Omit if the block is a pure own-cupon (Comunidad Coto) — leave [].
- wallet: array of wallet slugs participating. Empty [] if the block is purely
  bank-card. Use:
    * ["modo"] if the block mentions MODO
    * ["mercadopago"] for Mercado Pago QR
    * ["cuentadni"] for Cuenta DNI
    * ["uala"] for Ualá
    * ["naranjax"] for Naranja X
    * ["personalpay"] for Personal Pay
    * ["comunidad_coto"] for Comunidad Coto membership promo (own-cupon)
    * [] for straight card-only promos.
  If the block says "pagando con QR desde la app de tu banco o app Modo" then
  wallet = ["modo"].
- card_brand: optional array from ["visa","mastercard","amex","cabal","naranja"].
  Omit or empty if not stated.
- valid_regions: use [] (national, unless legal text names a province specifically).
- valid_from: YYYY-MM-DD. If the block says "Del DD/MM/YY al DD/MM/YY", use those.
  Otherwise default to "2026-04-01".
- valid_to: YYYY-MM-DD. Legal text "Vigencia hasta el 30/04" → "2026-04-30".
  Default "2026-04-30" when absent.
- requires_min_spend: ARS number if "Mínimo de compra $X" is stated. null otherwise.
- notes: optional short free-text for caveats ("Exclusivo Clientes Sueldo",
  "Clientes Segmento Unico", "cartera general", etc.) that would otherwise be lost.

IMPORTANT:
  - Do NOT merge two distinct blocks into one variant — emit them as separate promos.
  - Do NOT fabricate topes. If the block literally says "sin tope", set tope=null.
  - When the SAME bank has multiple tiers on the same day (e.g., Naranja X 10% tope
    $3k for non-Plan-Turbo AND 25% tope $12k for Plan Turbo), emit TWO separate promos.`;

export interface ExtractCotoArgs {
  source_url: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmSuperPayload; usage: GeminiUsage }>;
}

export async function extractCotoPromos(args: ExtractCotoArgs): Promise<ExtractSupermarketResult> {
  return extractSupermarketPromos({
    source_id: COTO_SOURCE_ID,
    source_url: args.source_url,
    markdown: args.markdown,
    prompt: COTO_EXTRACTION_PROMPT,
    default_regions: [],
    llmOverride: args.llmOverride,
  });
}

// Re-exports for the adapter and tests.
export { supermarketPromoId as cotoPromoId } from './supermarket-extract.js';
