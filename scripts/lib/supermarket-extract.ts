// Shared scaffolding for supermarket cross-bank catalog extractors.
//
// Coto, Jumbo, and Carrefour all publish the same kind of surface:
//   - Cross-bank catalogs (one page → N promos)
//   - Each promo block: day phrase + bank/wallet logo + headline pct OR
//     "N cuotas sin interés" + tope + legal body
//   - Occasionally cross-wallet universal blocks (e.g., Carrefour's
//     "10% QR todas las billeteras") that list many wallets / banks in one
//     block — those become ONE promo row with array-valued `wallet` and
//     `issuer_bank` rather than N separate rows.
//
// Canonical id strategy — v2 (2026-04-23):
//
//   Row id = uuidV5(`${source_url}#${day_key}#${banks_key}#${wallets_key}#${pct}#${promo_type}#${variant_key}`,
//                   SUPERMARKET_UUID_NAMESPACE_V2)
//
// Why this tuple (and not the v1 `(source_url, day_key, primary_bank, pct, promo_type)`)?
//
//   v1 collapsed distinct promos in two documented ways:
//
//   1. Cuotas tiers from the same bank on the same days. Jumbo's Cencopay shows
//      3/6/12/18/24 cuotas as separate blocks on `Todos los días` — all have
//      pct=0 + promo_type='cuotas' + bank='cencopay' + day_key='0,1,2,3,4,5,6'
//      → same id. 5 distinct promos collapsed to 1 row (first wins).
//      Symptom in production (2026-04-23): "30 inserted / 47 updated" reported
//      but only 14 rows in the DB for jumbo-descuentos.
//
//   2. Multi-bank promos on Carrefour where only the FIRST sorted bank went
//      into the id. Two distinct blocks of the form "Sábados Galicia+BBVA
//      10%" vs "Sábados Galicia+Santander 10%" would share bank_key='bbva'
//      (if bbva appears in both) and collide.
//
//   v2 resolves both:
//
//   - `banks_key`:   ALL sorted+deduped banks joined by `|`. Captures the full
//                    bank composition of the promo block. Empty → `_none_`.
//   - `wallets_key`: ALL sorted+deduped wallets joined by `|`. Captures the
//                    cross-wallet universal promo composition. Empty → `_none_`.
//   - `variant_key`: disambiguates same-bank/day/pct/type collisions:
//                      * cuotas rows  → `cuotas_count` from the LLM payload
//                        (e.g., "3", "6", "12", "24")
//                      * cashback/mixed → compact tope signature
//                        (e.g., "20000:month", or "" if tope null)
//                    The prompt MUST elicit `cuotas_count` for cuotas rows.
//
// NEW UUID NAMESPACE (v2 → new namespace). Different from v1 so existing rows
// under the old tuple don't clash with newly-ingested v2 rows. Migration 007
// deletes the old rows; re-ingestion recreates them under v2 ids.
//
// `supermarketPromoIdV1` is retained ONLY for test fixtures that pin the old
// behaviour to prove the fix. Production code must not call it.
//
// Idempotency preservation: every v2 tuple component is normalized in-function
// (sort, dedup, lowercase, round) so Gemini drift (pct float jitter, valid_day
// duplicates, bank casing) cannot change the id. See the companion Phase-3.3
// hardening rationale below.
//
// Trade-off: when the chain reshuffles their catalog (e.g., drops a bank,
// changes the day a promo runs on), new ids emit. Phase 4 dedup will collapse
// equivalent promos across sources anyway.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

// v1 namespace — retained for test-only proof of pre-fix behaviour. Do NOT use
// in production paths. The v2 production path uses the new namespace below.
export const SUPERMARKET_UUID_NAMESPACE = '7b9f3d1c-2e4a-5b6c-8d7e-9f0a1b2c3d4e';

// v2 namespace — the live production id namespace as of 2026-04-23.
// Different from v1 so v1 and v2 ids never collide, which means we can run a
// dry-run test-harness extraction under v1 next to a live v2 extraction for
// debugging without cross-contamination.
export const SUPERMARKET_UUID_NAMESPACE_V2 = '2a6d7e1f-9c8b-4a3e-8d5c-1f0e2b3a4c5d';

// =============================================================================
// LLM payload schema — tolerant of empty-string tope_period per the MODO quirk.
// Added `cuotas_count` for v2 id scheme — optional integer (null for cashback).
// =============================================================================
const TopePeriod = z.union([z.enum(['ticket', 'day', 'week', 'month']), z.literal(''), z.null()]);
const PromoTypeEnum = z.enum(['cashback', 'cuotas', 'mixed']);

export const LlmSuperPromo = z.object({
  day_phrase: z.string(), // verbatim from the page — used to build day_key
  valid_days: z.array(z.number().int().min(0).max(6)),
  pct: z.number(), // 0 for cuotas-only rows (pct=0 + promo_type='cuotas')
  promo_type: PromoTypeEnum,
  tope: z.number().nullable(),
  tope_period: TopePeriod,
  /**
   * Cuotas count — number of installments. REQUIRED for promo_type='cuotas'
   * to disambiguate same-bank/day cuotas tiers (Cencopay 3 / 6 / 12 / 24).
   * null for cashback/mixed rows.
   */
  cuotas_count: z.number().int().positive().nullable().optional(),
  merchant: z.string(), // the chain ("Coto", "Jumbo", "Carrefour")
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
  issuer_bank: z.array(z.string()), // ALL banks participating in this block
  wallet: z.array(z.string()), // ALL wallets participating (incl. cross-wallet)
  card_brand: z.array(z.string()).optional(),
  valid_regions: z.array(z.string()),
  valid_from: z.string(),
  valid_to: z.string(),
  requires_min_spend: z.number().nullable(),
  notes: z.string().optional(),
});
export type LlmSuperPromo = z.infer<typeof LlmSuperPromo>;

export const LlmSuperPayload = z.object({
  promos: z.array(LlmSuperPromo),
});
export type LlmSuperPayload = z.infer<typeof LlmSuperPayload>;

// =============================================================================
// Hand-rolled Gemini responseSchema — same pattern as MODO/Cuenta DNI.
// =============================================================================
export const SUPERMARKET_GEMINI_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    promos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day_phrase: { type: 'STRING' },
          valid_days: { type: 'ARRAY', items: { type: 'INTEGER' } },
          pct: { type: 'NUMBER' },
          promo_type: {
            type: 'STRING',
            enum: ['cashback', 'cuotas', 'mixed'],
          },
          tope: { type: 'NUMBER', nullable: true },
          tope_period: {
            type: 'STRING',
            enum: ['ticket', 'day', 'week', 'month'],
            nullable: true,
          },
          cuotas_count: { type: 'INTEGER', nullable: true },
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
          issuer_bank: { type: 'ARRAY', items: { type: 'STRING' } },
          wallet: { type: 'ARRAY', items: { type: 'STRING' } },
          card_brand: { type: 'ARRAY', items: { type: 'STRING' } },
          valid_regions: { type: 'ARRAY', items: { type: 'STRING' } },
          valid_from: { type: 'STRING', description: 'YYYY-MM-DD' },
          valid_to: { type: 'STRING', description: 'YYYY-MM-DD' },
          requires_min_spend: { type: 'NUMBER', nullable: true },
          notes: { type: 'STRING' },
        },
        required: [
          'day_phrase',
          'valid_days',
          'pct',
          'promo_type',
          'tope',
          'tope_period',
          'merchant',
          'category',
          'issuer_bank',
          'wallet',
          'valid_regions',
          'valid_from',
          'valid_to',
          'requires_min_spend',
        ],
        propertyOrdering: [
          'day_phrase',
          'valid_days',
          'pct',
          'promo_type',
          'tope',
          'tope_period',
          'cuotas_count',
          'merchant',
          'category',
          'issuer_bank',
          'wallet',
          'card_brand',
          'valid_regions',
          'valid_from',
          'valid_to',
          'requires_min_spend',
          'notes',
        ],
      },
    },
  },
  required: ['promos'],
};

// =============================================================================
// Valid wallet enum (kept in sync with scripts/promo-schema.ts).
// The extractor accepts LLM-emitted values from a broader set and normalizes
// synonyms before the canonical Zod gate.
// =============================================================================
const VALID_WALLETS = new Set<string>([
  'modo',
  'mercadopago',
  'cuentadni',
  'uala',
  'naranjax',
  'personalpay',
  'brubank',
  'bna_plus',
  'prex',
  'yoy',
  'buepp',
  'lemon',
  'astropay',
  'reba',
  'comunidad_coto',
  'jumbo_mas',
  'mi_carrefour',
]);

const WALLET_SYNONYMS: Record<string, string> = {
  mercado_pago: 'mercadopago',
  cuenta_dni: 'cuentadni',
  ualá: 'uala',
  'naranja-x': 'naranjax',
  'naranja_x': 'naranjax',
  personal_pay: 'personalpay',
  bnaplus: 'bna_plus',
  bna: 'bna_plus',
  'bna+': 'bna_plus',
  ualaplus: 'uala',
  'carrefour-banco': 'mi_carrefour',
  carrefour_banco: 'mi_carrefour',
  micarrefour: 'mi_carrefour',
  'mi-carrefour': 'mi_carrefour',
  'comunidad-coto': 'comunidad_coto',
  comunidadcoto: 'comunidad_coto',
  comunidad: 'comunidad_coto',
  'jumbo+': 'jumbo_mas',
  jumbomas: 'jumbo_mas',
  'jumbo-mas': 'jumbo_mas',
};

/** Lowercase + strip accents + trim for stable matching. */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Normalize LLM-emitted wallet strings to the canonical enum. Drops unknowns. */
export function normalizeWallets(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const r of raw) {
    const n = norm(r).replace(/\s+/g, '_');
    const canonical = WALLET_SYNONYMS[n] ?? n;
    if (VALID_WALLETS.has(canonical)) out.add(canonical);
  }
  return [...out].sort();
}

/** Normalize issuer_bank (free-form, kept lowercase + deduped). */
export function normalizeBanks(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const r of raw) {
    const n = norm(r).replace(/\s+/g, '');
    if (n) out.add(n);
  }
  return [...out].sort();
}

/** Normalize card_brand to the canonical enum. Drops unknowns. */
const VALID_CARDS = new Set(['visa', 'mastercard', 'amex', 'cabal', 'naranja']);
export function normalizeCardBrands(raw: string[] | undefined): string[] | undefined {
  if (!raw) return undefined;
  const out = new Set<string>();
  for (const r of raw) {
    const n = norm(r).replace(/\s+/g, '');
    // Common variants
    if (n === 'americanexpress' || n === 'american_express') out.add('amex');
    else if (n === 'mastercar') out.add('mastercard');
    else if (VALID_CARDS.has(n)) out.add(n);
  }
  return out.size > 0 ? [...out].sort() : undefined;
}

/**
 * Stable day_key: deduped + sorted weekday numbers joined by commas.
 *
 * Dedup is critical: Gemini occasionally emits arrays like `[6, 0, 6]` due to
 * token-boundary nondeterminism on cross-phrase blocks ("Todos los Sábados y
 * Domingos" + a stray "Sábado" near the legal body). Without dedup the id
 * tuple for the SAME promo would drift across runs. This is one of the known
 * root causes of the Phase 3.3 Carrefour idempotency flake.
 */
export function dayKey(valid_days: number[]): string {
  const seen = new Set<number>();
  for (const d of valid_days) {
    if (Number.isInteger(d) && d >= 0 && d <= 6) seen.add(d);
  }
  return [...seen].sort((a, b) => a - b).join(',');
}

/**
 * Primary bank (for v1 id derivation): first sorted bank after dedup, or
 * `_none_` if empty.
 *
 * Retained for backward compatibility with `supermarketPromoIdV1` which is
 * used ONLY by regression tests that prove the v1 collision shape. Production
 * extraction uses `banksKey` (v2) which includes ALL banks.
 */
export function primaryBank(issuer_bank: string[]): string {
  const seen = new Set<string>();
  for (const b of issuer_bank) {
    const trimmed = b.trim().toLowerCase();
    if (trimmed) seen.add(trimmed);
  }
  if (seen.size === 0) return '_none_';
  return [...seen].sort()[0];
}

/**
 * v2 banks_key: ALL sorted+deduped banks joined by `|`. Empty → `_none_`.
 *
 * This is the v2 upgrade over `primaryBank`. A promo block that spans multiple
 * banks (e.g., Carrefour's "BBVA + Galicia + Santander all offer 10% saturdays
 * with identical terms") produces a SINGLE id under v2, distinguishable from
 * any other Saturday 10% promo with a different bank composition. Under v1,
 * `primaryBank` only saw "bbva" — two multi-bank blocks could share the same
 * first-alphabetical bank and collide.
 *
 * Normalizes input (lowercase, trim, dedup) so Gemini casing drift doesn't
 * affect the id.
 */
export function banksKey(issuer_bank: string[]): string {
  const seen = new Set<string>();
  for (const b of issuer_bank) {
    const trimmed = b.trim().toLowerCase();
    if (trimmed) seen.add(trimmed);
  }
  if (seen.size === 0) return '_none_';
  return [...seen].sort().join('|');
}

/**
 * v2 wallets_key: ALL sorted+deduped wallets joined by `|`. Empty → `_none_`.
 *
 * Carrefour's universal cross-wallet "10% QR todas las billeteras" block emits
 * ONE row with wallet=[8 slugs]. Under v1, wallets didn't enter the id at all
 * — so a pct-10 + saturday + no-bank universal block would collide with any
 * other pct-10 + saturday + no-bank row. This key prevents that.
 */
export function walletsKey(wallet: string[]): string {
  const seen = new Set<string>();
  for (const w of wallet) {
    const trimmed = w.trim().toLowerCase();
    if (trimmed) seen.add(trimmed);
  }
  if (seen.size === 0) return '_none_';
  return [...seen].sort().join('|');
}

/**
 * Canonicalize the `pct` component of the id tuple.
 *
 * The prompt says "integer percent", but Gemini occasionally emits float
 * approximations ("30.0", "10.000001") due to token-boundary numeric
 * decoding. Rounding to the nearest integer prevents those alt-representations
 * from producing a distinct UUID for the same semantic promo. Source of the
 * Carrefour "1 insert / 24 updates" flake on idempotent re-run.
 */
export function canonicalPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.round(pct);
}

/** Canonicalize the `promo_type` component — trim + lowercase (enum-safe). */
export function canonicalPromoType(promo_type: string): string {
  return String(promo_type).trim().toLowerCase();
}

/**
 * v2 variant_key: disambiguates rows that share (day, bank, wallet, pct, type).
 *
 * For cuotas rows: `cuotas_count` (e.g. "3", "6", "12"). If the LLM didn't
 * emit it (legacy fixture or partial extraction), falls back to "" — the
 * extractor will log a warning but we accept the row rather than collapse it.
 *
 * For cashback/mixed rows: a compact tope signature (`"20000:month"`) to
 * separate same-bank/day/pct tiers like "10% sueldo tope $8k/week" vs
 * "10% segmento tope $15k/week" when they appear on the same page.
 * Empty tope → empty signature.
 */
export function variantKey(args: {
  promo_type: string;
  cuotas_count: number | null | undefined;
  tope: number | null;
  tope_period: string | null | undefined;
}): string {
  const type = canonicalPromoType(args.promo_type);
  if (type === 'cuotas') {
    return args.cuotas_count != null && Number.isFinite(args.cuotas_count)
      ? `c${Math.round(args.cuotas_count)}`
      : '';
  }
  // cashback / mixed
  if (args.tope == null) return '';
  const period = (args.tope_period ?? '').toString().trim().toLowerCase();
  return `${Math.round(args.tope)}:${period}`;
}

// =============================================================================
// Deterministic UUID v5 (same helper as MODO / Cuenta DNI).
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

// =============================================================================
// v1 id — retained for regression tests that pin the pre-fix collision shape.
// Production code uses supermarketPromoId (v2) below.
// =============================================================================
export interface IdTupleV1 {
  source_url: string;
  day_key: string;
  bank_key: string;
  pct: number;
  promo_type: string;
}
export function supermarketPromoIdV1(t: IdTupleV1): string {
  const source_url = t.source_url.trim();
  const day_key = String(t.day_key).trim();
  const bank_key = t.bank_key.trim().toLowerCase();
  const pct = canonicalPct(t.pct);
  const promo_type = canonicalPromoType(t.promo_type);
  const name = `${source_url}#${day_key}#${bank_key}#${pct}#${promo_type}`;
  return uuidV5(name, SUPERMARKET_UUID_NAMESPACE);
}

// =============================================================================
// v2 id — the production id scheme as of 2026-04-23.
// =============================================================================
export interface IdTuple {
  source_url: string;
  day_key: string;
  banks_key: string;
  wallets_key: string;
  pct: number;
  promo_type: string;
  variant_key: string;
}

/**
 * Build the deterministic UUID v5 for a supermarket promo under the v2 scheme.
 *
 * All components are re-normalized defensively so callers passing raw values
 * still get a stable id:
 *   - `source_url`: trimmed
 *   - `day_key`:     lightly trimmed (caller should have used `dayKey()`)
 *   - `banks_key`:   lowercased + trimmed (caller should have used `banksKey()`)
 *   - `wallets_key`: lowercased + trimmed (caller should have used `walletsKey()`)
 *   - `pct`:         rounded to nearest integer (see `canonicalPct`)
 *   - `promo_type`:  lowercased + trimmed (`canonicalPromoType`)
 *   - `variant_key`: lowercased + trimmed
 */
export function supermarketPromoId(t: IdTuple): string {
  const source_url = t.source_url.trim();
  const day_key = String(t.day_key).trim();
  const banks_key = t.banks_key.trim().toLowerCase();
  const wallets_key = t.wallets_key.trim().toLowerCase();
  const pct = canonicalPct(t.pct);
  const promo_type = canonicalPromoType(t.promo_type);
  const variant_key = String(t.variant_key).trim().toLowerCase();
  const name =
    `${source_url}#${day_key}#${banks_key}#${wallets_key}#${pct}#${promo_type}#${variant_key}`;
  return uuidV5(name, SUPERMARKET_UUID_NAMESPACE_V2);
}

// =============================================================================
// Chunked extraction — the long-term answer to the Carrefour truncation bug.
//
// Problem (2026-04-23, `pnpm run-carrefour`):
//   Single LLM call for the full page (~25-30 blocks) → JSON payload with long
//   notes fields exceeded maxOutputTokens, truncated mid-string, parse failed.
//   Bumping maxOutputTokens only defers the problem (if the catalog grows to 50
//   blocks, the 8192 ceiling will also fail).
//
// Solution (Option 1 — section-level chunking):
//   Source adapters supply a `chunker` callback that splits the markdown into
//   N small chunks, each containing ~1-3 promo blocks (small enough that
//   Gemini's output fits in <2k tokens per call). We run one call per chunk
//   with bounded concurrency, merge the resulting promos, and report per-chunk
//   telemetry (success/failure). A single bad chunk does NOT kill the run.
//
//   Why section-level chunking and not per-promo?
//     - Per-promo (Option 5) would require reliable single-block boundary
//       detection at the TS layer, which is brittle when the markdown has
//       marketing banners / duplicate logos / embedded nav.
//     - Section-level chunking uses source-specific markers ("Ver legal" for
//       Carrefour, `- ![](...png)` for Jumbo) that are robust heuristics
//       already present in the raw scrape. 2 blocks per chunk still keeps
//       Gemini output under 1k tokens each.
//     - The single-shot path is retained as a fallback when `chunker` is not
//       provided (preserves Coto behaviour, which has shorter catalogs).
// =============================================================================

export type SupermarketChunker = (markdown: string) => string[];

/**
 * Run `extractStructured` once per chunk with bounded concurrency.
 * Merges all per-chunk `LlmSuperPayload.promos` into a single payload.
 * Surfaces per-chunk errors in `chunk_errors` (telemetry).
 */
async function runChunkedLlm(args: {
  chunks: string[];
  prompt: string;
  source_id: string;
  source_url: string;
  concurrency: number;
  maxOutputTokens: number;
}): Promise<{
  payload: LlmSuperPayload;
  usage: GeminiUsage;
  chunk_errors: string[];
  chunks_total: number;
  chunks_succeeded: number;
}> {
  const { chunks, prompt, source_id, source_url, concurrency, maxOutputTokens } = args;

  const results = new Array<{
    promos: LlmSuperPromo[];
    usage: GeminiUsage;
    error: string | null;
  }>(chunks.length);

  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), chunks.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= chunks.length) return;
      try {
        const r = await extractStructured({
          prompt: `${prompt}\n\nsource_id: ${source_id}\nsource_url: ${source_url}`,
          content: chunks[idx],
          schema: LlmSuperPayload,
          schemaForModel: SUPERMARKET_GEMINI_SCHEMA,
          maxOutputTokens,
        });
        results[idx] = { promos: r.data.promos, usage: r.usage, error: null };
      } catch (err: any) {
        results[idx] = {
          promos: [],
          usage: { input_tokens: 0, output_tokens: 0, thoughts_tokens: 0, cost_usd: 0 },
          error: err?.message ?? String(err),
        };
      }
    }
  });
  await Promise.all(workers);

  const mergedPromos: LlmSuperPromo[] = [];
  const chunk_errors: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalThoughts = 0;
  let totalCost = 0;
  let succeeded = 0;

  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.error) {
      chunk_errors.push(`chunk#${i}: ${r.error}`);
    } else {
      succeeded += 1;
      for (const p of r.promos) mergedPromos.push(p);
    }
    totalInput += r.usage.input_tokens;
    totalOutput += r.usage.output_tokens;
    totalThoughts += r.usage.thoughts_tokens;
    totalCost += r.usage.cost_usd;
  }

  return {
    payload: { promos: mergedPromos },
    usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput,
      thoughts_tokens: totalThoughts,
      cost_usd: Math.round(totalCost * 10_000) / 10_000,
    },
    chunk_errors,
    chunks_total: chunks.length,
    chunks_succeeded: succeeded,
  };
}

// =============================================================================
// Shared extraction entry point — takes a source-specific prompt + source_id +
// default region, runs Gemini, applies the canonical Zod gate, emits Promo[]
// with deterministic ids.
// =============================================================================
export interface ExtractSupermarketArgs {
  source_id: string;
  source_url: string;
  markdown: string;
  prompt: string;
  default_regions?: string[];
  /** Optional per-URL override. */
  llmOverride?: (content: string) => Promise<{ data: LlmSuperPayload; usage: GeminiUsage }>;
  maxOutputTokens?: number;
  /**
   * Optional chunker. When provided AND produces 2+ chunks, the extractor runs
   * one Gemini call per chunk with bounded concurrency and merges the results.
   * This is the long-term answer to oversize catalogs. For small pages, return
   * a 1-element array (or omit) to preserve single-call behaviour.
   */
  chunker?: SupermarketChunker;
  /** Per-chunk concurrency. Defaults to 4 (same ceiling as the MODO runner). */
  chunkConcurrency?: number;
}

export interface ExtractSupermarketResult {
  promos: Promo[];
  ids: string[];
  usage: GeminiUsage;
  rejected_count: number;
  rejected_reasons: string[];
  /** Per-chunk telemetry. 1 chunk means single-call path (no chunker). */
  chunks_total: number;
  chunks_succeeded: number;
  chunk_errors: string[];
  /**
   * Count of cuotas rows whose cuotas_count was missing. These rows risk
   * collision on the variant_key (empty string for all of them). Surface so
   * the adapter can warn loudly if it exceeds a threshold.
   */
  cuotas_missing_count: number;
}

export async function extractSupermarketPromos(
  args: ExtractSupermarketArgs,
): Promise<ExtractSupermarketResult> {
  const {
    source_id,
    source_url,
    markdown,
    prompt,
    default_regions = [],
    maxOutputTokens = 6144, // catalogs are large (~20-60 blocks per page)
    chunker,
    chunkConcurrency = 4,
  } = args;

  let payload: LlmSuperPayload;
  let usage: GeminiUsage;
  let chunk_errors: string[] = [];
  let chunks_total = 1;
  let chunks_succeeded = 1;

  if (args.llmOverride) {
    // Test override — single call, full payload from caller.
    const r = await args.llmOverride(markdown);
    payload = r.data;
    usage = r.usage;
  } else if (chunker) {
    const chunks = chunker(markdown).filter((c) => c.trim().length > 0);
    if (chunks.length <= 1) {
      // Chunker returned ≤1 chunk — treat as single-call (safety: never hit
      // zero-chunk state if chunker couldn't find delimiters; pass the full
      // markdown through instead of silently extracting nothing).
      const r = await extractStructured({
        prompt: `${prompt}\n\nsource_id: ${source_id}\nsource_url: ${source_url}`,
        content: chunks[0] ?? markdown,
        schema: LlmSuperPayload,
        schemaForModel: SUPERMARKET_GEMINI_SCHEMA,
        maxOutputTokens,
      });
      payload = r.data;
      usage = r.usage;
    } else {
      const r = await runChunkedLlm({
        chunks,
        prompt,
        source_id,
        source_url,
        concurrency: chunkConcurrency,
        // Each chunk is small (~1-3 blocks) — 2048 tokens per chunk is ample.
        // Keep maxOutputTokens respect the caller's override if explicitly lower.
        maxOutputTokens: Math.min(maxOutputTokens, 2048),
      });
      payload = r.payload;
      usage = r.usage;
      chunk_errors = r.chunk_errors;
      chunks_total = r.chunks_total;
      chunks_succeeded = r.chunks_succeeded;
    }
  } else {
    const r = await extractStructured({
      prompt: `${prompt}\n\nsource_id: ${source_id}\nsource_url: ${source_url}`,
      content: markdown,
      schema: LlmSuperPayload,
      schemaForModel: SUPERMARKET_GEMINI_SCHEMA,
      maxOutputTokens,
    });
    payload = r.data;
    usage = r.usage;
  }

  const now = new Date().toISOString();
  const promos: Promo[] = [];
  const ids: string[] = [];
  const rejected_reasons: string[] = [];
  const seenIds = new Set<string>();
  let cuotasMissingCount = 0;

  for (const item of payload.promos) {
    const tope_period = item.tope_period === '' ? null : (item.tope_period ?? null);
    const wallet = normalizeWallets(item.wallet);
    const issuer_bank = normalizeBanks(item.issuer_bank);
    const card_brand = normalizeCardBrands(item.card_brand);
    const valid_regions = item.valid_regions.length > 0 ? item.valid_regions : default_regions;

    const candidate: Promo = {
      source_id,
      source_url,
      merchant: item.merchant,
      category: item.category,
      wallet: wallet as Promo['wallet'],
      issuer_bank: issuer_bank.length > 0 ? issuer_bank : undefined,
      card_brand: card_brand as Promo['card_brand'],
      pct: item.pct,
      promo_type: item.promo_type,
      tope: item.tope,
      tope_period,
      valid_days: item.valid_days,
      valid_regions,
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
      rejected_reasons.push(
        `${item.day_phrase} | pct=${item.pct} | banks=${item.issuer_bank.join(',')}: ${issues}`,
      );
      continue;
    }

    // Soft warning: cuotas rows should carry cuotas_count to disambiguate
    // tiers. When absent, variant_key falls back to '' and same-bank/day
    // cuotas rows with different tiers will collide. Don't reject — the row
    // is still directionally useful — but surface the count so we can tune
    // the prompt.
    if (canonicalPromoType(item.promo_type) === 'cuotas' && item.cuotas_count == null) {
      cuotasMissingCount += 1;
    }

    const id = supermarketPromoId({
      source_url,
      day_key: dayKey(item.valid_days),
      banks_key: banksKey(issuer_bank),
      wallets_key: walletsKey(wallet),
      pct: item.pct,
      promo_type: item.promo_type,
      variant_key: variantKey({
        promo_type: item.promo_type,
        cuotas_count: item.cuotas_count ?? null,
        tope: item.tope,
        tope_period,
      }),
    });

    // Intra-page dedup: if two blocks distill to the same id tuple (e.g., the
    // page repeats a bank+day+pct row twice across "Por Día" and "Por Banco"
    // tabs on Jumbo), keep the first.
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    promos.push(zr.data);
    ids.push(id);
  }

  if (cuotasMissingCount > 0) {
    console.warn(
      `[${source_id}] ${cuotasMissingCount} cuotas row(s) missing cuotas_count — ` +
        `variant_key will be empty for those rows. Collision risk: tier rows on the ` +
        `same bank+day will dedupe to one. Tune the source prompt to elicit cuotas_count.`,
    );
  }

  return {
    promos,
    ids,
    usage,
    rejected_count: rejected_reasons.length,
    rejected_reasons,
    chunks_total,
    chunks_succeeded,
    chunk_errors,
    cuotas_missing_count: cuotasMissingCount,
  };
}
