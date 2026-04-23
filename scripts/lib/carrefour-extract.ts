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
//
// LONG-TERM SCALING — CHUNKED EXTRACTION (2026-04-23):
// The live `/descuentos-bancarios` page has grown to ~30 blocks, each with a
// long exclusion legal body (bodega lists, electrodoméstico exclusions). A
// single Gemini call for the whole page hit maxOutputTokens and truncated
// mid-string — docs/sources/carrefour.md "2026-04-23 truncation" incident.
//
// Fix: split the markdown at `Ver legal` markers (one per promo block),
// group 2 blocks per chunk, run one Gemini call per chunk at concurrency 4.
// Each chunk's output fits comfortably in 2048 tokens.
//
// The chunker `buildCarrefourChunker` is the source of truth for this split.
// It's exported so tests can pin the behavior.
import {
  extractSupermarketPromos,
  supermarketPromoId,
  type ExtractSupermarketResult,
  type LlmSuperPayload,
  type SupermarketChunker,
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
- cuotas_count: REQUIRED for promo_type="cuotas". Integer number of installments
  ("3cuotas" → 3, "12 cuotas sin interés" → 12, "Hasta 6 cuotas" → 6). null for
  cashback/mixed rows. This disambiguates same-bank/day cuotas tiers on the
  id level (3 cuotas vs 6 cuotas vs 12 cuotas on Cencopay).
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
- notes: KEEP SHORT (<= 200 chars). Short caveats only: "Exclusivo Online",
  "No válido en hipermercados", "No incluye electro". Do NOT reproduce the full
  legal exclusion list — it's captured upstream in the source markdown. Long
  notes blow through output tokens.

IMPORTANT:
  - "SIN TOPE" in the legal body → tope=null, tope_period=null. Do NOT guess a tope.
  - Promos with multiple banks sharing IDENTICAL terms (e.g., "10% sábados con
    BBVA/Galicia/Santander, tope $8k/mes") = ONE promo row with issuer_bank=
    ["bbva","galicia","santander"].
  - Promos where each bank has DIFFERENT terms (rare on Carrefour) = separate rows.
  - Do NOT emit marketing banner rows like "ELECTRO BLACK! Hasta 30% OFF" — only
    actual bank/wallet promos tied to a bank or billetera.
  - The Mi Carrefour card, when it appears as the sole wallet of a block, is
    wallet: ["mi_carrefour"] with issuer_bank: [].
  - The input you receive may be a CHUNK of the page (1-3 promo blocks), not the
    full page. Emit every promo block the chunk contains. Do NOT refuse because
    the chunk looks partial — it's intentional.`;

/**
 * Chunker for Carrefour /descuentos-bancarios markdown.
 *
 * Strategy: the page's promo catalog is delimited by "Ver legal" lines (one
 * per promo block). We split AFTER each "Ver legal" + its following legal body
 * (which runs until the next block's day label). Then we re-pair chunks so
 * each chunk carries `blocksPerChunk` promo blocks (default 2). This keeps
 * Gemini's output per call under ~1.5k tokens even for long legal bodies, well
 * within the 2048 budget.
 *
 * If the markdown has fewer than 2 blocks OR the "Ver legal" marker is not
 * found, returns a single-element array (whole markdown) as a safe fallback —
 * the caller falls back to single-call extraction.
 */
export function buildCarrefourChunker(options: { blocksPerChunk?: number } = {}): SupermarketChunker {
  const blocksPerChunk = Math.max(1, options.blocksPerChunk ?? 2);
  return (markdown: string): string[] => {
    if (!markdown || typeof markdown !== 'string') return [markdown ?? ''];

    // Each promo block includes a line that literally reads "Ver legal" or
    // starts with it (before the legal body). We split the input on the
    // NEXT blank-line boundary that follows a "Ver legal" line, producing one
    // chunk per promo block.
    const lines = markdown.split('\n');
    const blocks: string[] = [];
    let buf: string[] = [];
    let sawVerLegal = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      buf.push(line);

      // "Ver legal" anchors the end of the descriptive part; the next
      // paragraph is the legal body. We want to include the legal body in the
      // same chunk — keep accumulating until we hit a blank line AFTER the
      // legal body starts.
      if (!sawVerLegal && /^Ver legal\b/i.test(line.trim())) {
        sawVerLegal = true;
        continue;
      }

      // After seeing "Ver legal" and its paragraph, a blank line signals the
      // end of this promo block.
      if (sawVerLegal && line.trim() === '' && buf.length > 0) {
        // Peek forward: if the next non-blank line looks like a block header
        // (day phrase or headline) we end this block here. Otherwise keep
        // accumulating — some blocks have multi-paragraph legal bodies.
        let nextNonBlank = '';
        for (let j = i + 1; j < lines.length; j += 1) {
          if (lines[j].trim() !== '') {
            nextNonBlank = lines[j].trim();
            break;
          }
        }
        // A day label or headline typically appears early, or the next block
        // starts with "Comprando en:" or a date phrase. If the lookahead is
        // empty (end of doc) we also close.
        const isBlockBoundary =
          nextNonBlank === '' ||
          /^(Todos los|Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bados?|Domingos?|Fines de|Realizando tu compra|Pagando|Con tu|Comprando en:)/i.test(
            nextNonBlank,
          ) ||
          /^\d/.test(nextNonBlank); // "20%", "3cuotas", etc.
        if (isBlockBoundary) {
          blocks.push(buf.join('\n').trim());
          buf = [];
          sawVerLegal = false;
        }
      }
    }

    // Flush tail.
    if (buf.length > 0) {
      const tail = buf.join('\n').trim();
      if (tail.length > 0) blocks.push(tail);
    }

    // Filter empty & require ≥2 blocks to justify chunking.
    const real = blocks.filter((b) => /Ver legal/i.test(b));
    if (real.length < 2) return [markdown];

    // The PRELUDE (nav, header, "Comprando en:") before the first "Ver legal"
    // is preserved by including it as the first block. We keep a compact
    // preamble with ALL chunks so Gemini has the day-label context that may
    // precede the block (day labels appear BEFORE "Ver legal").
    //
    // Simpler strategy: keep each block self-contained as emitted. The block
    // already starts at the prior blank line boundary (which was the day
    // label / headline). Verified against the fixture.

    // Group `blocksPerChunk` blocks per chunk.
    const chunks: string[] = [];
    for (let i = 0; i < real.length; i += blocksPerChunk) {
      chunks.push(real.slice(i, i + blocksPerChunk).join('\n\n'));
    }
    return chunks;
  };
}

/** Default chunker used in production. */
export const CARREFOUR_CHUNKER = buildCarrefourChunker();

export interface ExtractCarrefourArgs {
  source_url: string;
  markdown: string;
  llmOverride?: (content: string) => Promise<{ data: LlmSuperPayload; usage: GeminiUsage }>;
  /** Override the chunker (e.g., disable chunking with `() => [markdown]`). */
  chunker?: SupermarketChunker;
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
    // Per-chunk ceiling — 2048 is enforced in the shared helper, but the arg
    // is required for the single-call fallback (when chunker returns 1 chunk).
    maxOutputTokens: 8192,
    chunker: args.chunker ?? CARREFOUR_CHUNKER,
    chunkConcurrency: 4,
  });
}

export { supermarketPromoId as carrefourPromoId } from './supermarket-extract.js';
