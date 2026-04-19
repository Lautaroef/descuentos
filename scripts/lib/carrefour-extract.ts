// Carrefour /descuentos-bancarios cross-bank + cross-wallet catalog extractor.
//
// VTEX dataentity note (recorded here for durability): we probed the BP
// dataentity endpoint `/api/dataentities/BP/search?_fields=*` with multiple
// field names (name, title, day, bank, percent, image, logo, etc.) — ALL
// content fields return 403 "Cannot read private fields". The only publicly
// readable field is `id`. The BP dataentity IS the backing store for the
// `/descuentos-bancarios` catalog (image URLs prove it), but it is auth-gated
// for content. HTML scraping is the only viable path. See
// docs/sources/carrefour.md for the probe transcript.
//
// Catalog structure (scraped markdown):
//   - Day label ("Todos los Jueves de Marzo", "Lunes y Miércoles de Abril",
//     "Sábados de Abril", "Martes de Abril", "Todos los Sábados y Domingos")
//   - Headline: "20%" / "3cuotas sin interés" / "10% sin tope"
//   - Image captions: bank/wallet logos (base64-referenced via BP dataentity)
//   - Short description line
//   - Legal body with vigencia and tope
//
// Critical finding: Carrefour has UNIVERSAL cross-wallet blocks like the
// "10% sin tope con QR de todas las billeteras" that enumerate:
//   CARREFOUR BANCO, MERCADO PAGO, CUENTA DNI, MODO, NARANJA X, UALÁ, BNA+,
//   PERSONAL PAY, PREX
// This is a SINGLE promo with array-valued wallet, not N promos — model that
// way per the commit brief.
import {
  extractSupermarketPromos,
  supermarketPromoId,
  type ExtractSupermarketResult,
  type LlmSuperPayload,
} from './supermarket-extract.js';
import type { GeminiUsage } from './gemini.js';

export const CARREFOUR_SOURCE_ID = 'carrefour-descuentos-bancarios';

export const CARREFOUR_EXTRACTION_PROMPT = `You extract Carrefour supermarket
cross-bank / cross-wallet promos from the scraped markdown of
/descuentos-bancarios. The page lists many promos in the structure:

  <day label>
  Comprando en:
  <headline pct or cuotas>
  <image captions of bank/wallet logos>
  <short description>
  Ver legal
  <legal body with vigencia + tope>

Emit ONE object per distinct promo block. Cross-wallet blocks that list many
wallets in one legal body (e.g., the "10% sin tope con QR de todas las
billeteras virtuales participantes") are ONE promo with array-valued wallet,
NOT N separate promos.

Fields (required):

- day_phrase: verbatim from the block's day label. Examples:
  "Todos los Jueves de Marzo" (even though says "Marzo" in label, legal text
  says "TODOS LOS JUEVES DE ABRIL 2026" — trust the LEGAL TEXT for vigencia).
  "Lunes y Miércoles de Abril", "Sábados de Abril", "Martes de Abril",
  "Todos los Sábados y Domingos", "Jueves, Viernes, Sábados y Domingos".
- valid_days: 0-6 mapping (Sunday=0, Monday=1, ..., Saturday=6).
    * "Jueves" / "Todos los Jueves de X" → [4]
    * "Lunes y Miércoles" → [1,3]
    * "Sábados" → [6]
    * "Martes" → [2]
    * "Todos los Sábados y Domingos" → [0,6]
    * "Jueves, Viernes, Sábados y Domingos" → [0,4,5,6]
    * "Todos los días" / (no day clause) → [0,1,2,3,4,5,6]
- pct: integer percent. For cuotas rows, use 0.
- promo_type: "cashback" for %-off; "cuotas" for cuotas-only.
- tope: ARS from legal text. "TOPE DE DESCUENTO DE $10.000 POR SEMANA" → 10000.
  "TOPE POR MES $20.000" → 20000. "SIN TOPE" / "Sin tope de reintegro" → null.
  Cuotas rows have no tope → null.
- tope_period: week | month | ticket | day | null. "POR SEMANA" → week. "POR MES" → month.
- merchant: always "Carrefour".
- category: always "supermercado".
- issuer_bank: lowercased short names. Keep all bank entities mentioned in the
  legal body. Examples: bbva, galicia, santander, nacion, icbc, patagonia,
  comafi, supervielle, ciudad, credicoop, macro, columbia, carrefour (Carrefour
  Banco is the chain's own bank — if it's a Cuenta Digital de Carrefour Banco
  promo, use ["carrefour"]).
    * If the block is a pure wallet promo with no bank named → issuer_bank: [].
- wallet: array of wallet slugs participating. Use:
    * ["modo"] for MODO
    * ["mercadopago"] for Mercado Pago
    * ["cuentadni"] for Cuenta DNI
    * ["uala"] for Ualá
    * ["naranjax"] for Naranja X
    * ["personalpay"] for Personal Pay
    * ["bna_plus"] for BNA+
    * ["prex"] for Prex
    * ["mi_carrefour"] for Mi Carrefour (own loyalty)
  When a block's legal body explicitly lists many wallets in a "billeteras
  participantes" clause (e.g., CARREFOUR BANCO, MERCADO PAGO, CUENTA DNI, MODO,
  NARANJA X, UALÁ, BNA+, PERSONAL PAY, PREX), emit ALL of them in a SINGLE
  promo row's wallet array. Do NOT fan out to N rows.
- card_brand: optional ["visa","mastercard","amex","cabal","naranja"].
- valid_regions: [] (national — Carrefour has nationwide coverage).
- valid_from: YYYY-MM-DD from legal text. "01/04/2026" → "2026-04-01". Default
  "2026-04-01".
- valid_to: YYYY-MM-DD. "30/04/2026" → "2026-04-30". Default "2026-04-30".
- requires_min_spend: ARS if legal text stipulates "compra mínima $X". null otherwise.
- notes: short caveats — "Exclusivo Online", "No válido en hipermercados",
  "No incluye electro", "Acumulable con promos", etc.

IMPORTANT:
  - "SIN TOPE" in the legal body → tope=null, tope_period=null. Do NOT guess a tope.
  - Promos with multiple banks sharing IDENTICAL terms (e.g., "10% sábados con
    BBVA/Galicia/Santander, tope $8k/mes") = ONE promo row with issuer_bank=
    ["bbva","galicia","santander"].
  - Promos where each bank has DIFFERENT terms (rare on Carrefour) = separate rows.
  - Do NOT emit marketing banner rows like "ELECTRO BLACK! Hasta 30% OFF" — only
    actual bank/wallet promos tied to a bank or billetera.
  - The Mi Carrefour card, when it appears as the sole wallet of a block, is
    wallet: ["mi_carrefour"] with issuer_bank: [].`;

export interface ExtractCarrefourArgs {
  source_url: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmSuperPayload; usage: GeminiUsage }>;
}

export async function extractCarrefourPromos(
  args: ExtractCarrefourArgs,
): Promise<ExtractSupermarketResult> {
  return extractSupermarketPromos({
    source_id: CARREFOUR_SOURCE_ID,
    source_url: args.source_url,
    markdown: args.markdown,
    prompt: CARREFOUR_EXTRACTION_PROMPT,
    default_regions: [],
    llmOverride: args.llmOverride,
    maxOutputTokens: 8192, // Carrefour catalog is large (~30 blocks).
  });
}

export { supermarketPromoId as carrefourPromoId } from './supermarket-extract.js';
