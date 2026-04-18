// Validate: MODO stress-test extractions against canonical Promo schema.
// Reads scripts/samples/modo-stress/extraction-sweep.json and runs Zod on each extract.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

// Canonical Promo from architecture.md — copy here so we can add tolerance for a few enums.
// Per stress-test findings, we propose relaxing these tweaks:
// - category: add 'transporte' (real MODO category)
// - tope_period: allow null when tope is null (Sin-tope case), otherwise enum
const Promo = z.object({
  source_id: z.string().default('modo'),
  source_url: z.string().url(),
  merchant: z.string(),
  category: z.enum(['supermercado', 'farmacia', 'gastronomia', 'combustible', 'transporte', 'indumentaria', 'electro', 'otro']),
  wallet: z.array(z.enum(['modo', 'mercadopago', 'cuentadni', 'uala', 'naranjax', 'personalpay', 'brubank'])),
  pct: z.number(),
  tope: z.number().nullable(),
  tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable(),
  valid_days: z.array(z.number().int().min(0).max(6)),
  valid_regions: z.array(z.string()),
  valid_from: z.string().date(),
  valid_to: z.string().date(),
  requires_min_spend: z.number().nullable(),
  issuer_bank: z.array(z.string()).optional(),
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
});

async function main() {
  const raw = await readFile(new URL('./samples/modo-stress/extraction-sweep.json', import.meta.url), 'utf8');
  const data = JSON.parse(raw);

  const pages: any[] = data.pages;
  let pass = 0;
  let fail = 0;
  const fieldFails: Record<string, number> = {};

  for (const p of pages) {
    const ext = p.extract_v2 ?? p.extract_v1;
    if (!ext?.result) {
      console.log(`  [skip] ${p.slug} — no extract result`);
      continue;
    }
    const toValidate = {
      source_id: 'modo',
      source_url: p.url,
      ...ext.result,
      // Normalize empty-string tope_period to null when tope is null (known edge case).
      tope_period: ext.result.tope_period === '' ? null : ext.result.tope_period,
      wallet: ext.result.wallet ?? ['modo'],
    };
    const r = Promo.safeParse(toValidate);
    if (r.success) {
      pass++;
      console.log(`  [OK]   ${p.slug}`);
    } else {
      fail++;
      console.log(`  [FAIL] ${p.slug}:`);
      for (const issue of r.error.issues) {
        const path = issue.path.join('.');
        console.log(`         ${path}: ${issue.message}`);
        fieldFails[path] = (fieldFails[path] ?? 0) + 1;
      }
    }
  }
  console.log(`\nPass: ${pass}/${pass + fail}`);
  console.log('Field failures:', fieldFails);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
