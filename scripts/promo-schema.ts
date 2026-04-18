// Canonical Promo schema — copied from docs/architecture.md.
// This is the contract every ingestion path must emit against.
import { z } from 'zod';

export const Promo = z.object({
  source_id: z.string(),
  source_url: z.string().url(),
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
  wallet: z.array(
    z.enum(['modo', 'mercadopago', 'cuentadni', 'uala', 'naranjax', 'personalpay', 'brubank']),
  ),
  card_brand: z.array(z.enum(['visa', 'mastercard', 'amex', 'cabal', 'naranja'])).optional(),
  issuer_bank: z.array(z.string()).optional(),
  pct: z.number(),
  promo_type: z.enum(['cashback', 'cuotas', 'mixed']).default('cashback'),
  tope: z.number().nullable(),
  tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable(),
  valid_days: z.array(z.number().int().min(0).max(6)),
  valid_regions: z.array(z.string()),
  valid_from: z.string().date(),
  valid_to: z.string().date(),
  requires_min_spend: z.number().nullable(),
  stacks_with: z.array(z.string()).optional(),
  variants: z
    .array(
      z.object({
        pct: z.number(),
        tope: z.number().nullable().optional(),
        tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable().optional(),
        category_scope: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
  last_seen_at: z.string().datetime(),
});

export type Promo = z.infer<typeof Promo>;

// Fields we report coverage on.
export const PROMO_FIELDS = [
  'merchant',
  'category',
  'wallet',
  'pct',
  'tope',
  'tope_period',
  'valid_days',
  'valid_regions',
  'valid_from',
  'valid_to',
  'requires_min_spend',
] as const;

export type Coverage = 'direct' | 'derivable' | 'llm' | 'absent';
export type CoverageReport = Record<(typeof PROMO_FIELDS)[number], { coverage: Coverage; note: string }>;

export function printCoverage(sourceId: string, report: CoverageReport) {
  const icon = { direct: 'direct  ', derivable: 'derive  ', llm: 'LLM     ', absent: 'absent  ' } as const;
  console.log(`\n=== Coverage report: ${sourceId} ===`);
  for (const f of PROMO_FIELDS) {
    const r = report[f];
    console.log(`  [${icon[r.coverage]}] ${f.padEnd(20)} — ${r.note}`);
  }
}
