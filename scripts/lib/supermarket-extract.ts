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
// Canonical id strategy for this family (bulk, multi-block):
//
//   Row id = uuidV5(`${source_url}#${day_key}#${bank_key}#${pct}#${promo_type}`,
//                   SUPERMARKET_UUID_NAMESPACE)
//
// Why this tuple (and not `(source_url, merchant, pct)` like Cuenta DNI)?
//   - Merchant is constant on a cross-bank catalog page (always the chain), so
//     it can't distinguish rows.
//   - Multiple Mondays-only 30% promos from DIFFERENT banks need separate ids.
//   - Adding `promo_type` disambiguates a 20% cashback row from a 20% cuotas
//     row (Carrefour sometimes has both on the same day/bank).
//   - `day_key` is a stable normalized form of the weekday array (e.g.
//     "1" for Mondays, "1,2,3,4,5" for L-V, "0-6" for all days).
//
// Trade-off: when the chain reshuffles their catalog (e.g., drops a bank,
// changes the day a promo runs on), new ids emit. Phase 4 dedup will collapse
// equivalent promos across sources anyway.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Promo as PromoSchema, type Promo } from '../promo-schema.js';
import { extractStructured, type GeminiUsage } from './gemini.js';

// One namespace UUID shared across Coto/Jumbo/Carrefour. Different from MODO /
// Cuenta DNI so ids don't collide across sources.
export const SUPERMARKET_UUID_NAMESPACE = '7b9f3d1c-2e4a-5b6c-8d7e-9f0a1b2c3d4e';

// =============================================================================
// LLM payload schema — tolerant of empty-string tope_period per the MODO quirk.
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
 * Primary bank (for id derivation): first sorted bank after dedup, or
 * `_none_` if empty.
 *
 * Dedup is defensive — `normalizeBanks` already de-dupes via Set, but callers
 * may occasionally pass already-structured input (tests, migrations). Keeping
 * this function byte-identical across inputs is load-bearing for idempotency.
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

export interface IdTuple {
  source_url: string;
  day_key: string;
  bank_key: string;
  pct: number;
  promo_type: string;
}

/**
 * Build the deterministic UUID v5 for a supermarket promo.
 *
 * The tuple is normalized here (belt-and-suspenders) so callers who pass raw
 * values still get a stable id:
 *   - `source_url`: trimmed (never contains whitespace in practice)
 *   - `day_key`:     assumed already built via `dayKey()`; lightly trimmed
 *   - `bank_key`:    lowercased + trimmed
 *   - `pct`:         rounded to nearest integer (see `canonicalPct`)
 *   - `promo_type`:  lowercased + trimmed (`canonicalPromoType`)
 *
 * This hardening is specifically to defuse the Gemini token-boundary
 * nondeterminism observed on Carrefour's /descuentos-bancarios run
 * (1 insert / 24 updates on idempotent re-run, Phase 3.3).
 */
export function supermarketPromoId(t: IdTuple): string {
  const source_url = t.source_url.trim();
  const day_key = String(t.day_key).trim();
  const bank_key = t.bank_key.trim().toLowerCase();
  const pct = canonicalPct(t.pct);
  const promo_type = canonicalPromoType(t.promo_type);
  const name = `${source_url}#${day_key}#${bank_key}#${pct}#${promo_type}`;
  return uuidV5(name, SUPERMARKET_UUID_NAMESPACE);
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
}

export interface ExtractSupermarketResult {
  promos: Promo[];
  ids: string[];
  usage: GeminiUsage;
  rejected_count: number;
  rejected_reasons: string[];
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
  } = args;

  let payload: LlmSuperPayload;
  let usage: GeminiUsage;

  if (args.llmOverride) {
    const r = await args.llmOverride(markdown);
    payload = r.data;
    usage = r.usage;
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

    const id = supermarketPromoId({
      source_url,
      day_key: dayKey(item.valid_days),
      bank_key: primaryBank(issuer_bank),
      pct: item.pct,
      promo_type: item.promo_type,
    });

    // Intra-page dedup: if two blocks distill to the same id tuple (e.g., the
    // page repeats a bank+day+pct row twice across "Por Día" and "Por Banco"
    // tabs on Jumbo), keep the first.
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    promos.push(zr.data);
    ids.push(id);
  }

  return {
    promos,
    ids,
    usage,
    rejected_count: rejected_reasons.length,
    rejected_reasons,
  };
}
