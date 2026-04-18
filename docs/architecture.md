# Architecture

**Design goals**: cheap to run idle, resilient to per-source breakage, fast for filter-by-wallet/category/day/tope queries, and swappable layer by layer.

## Stack

| Layer | Pick | Why |
|---|---|---|
| Fetching | Firecrawl (funded) | Handles anti-bot, JS rendering, sitemap/lastmod tracking, content hashing out of the box. |
| Extraction | Claude Haiku 4.5 **or** GPT-4o-mini, with Zod schema validation | Per-site CSS parsers rot weekly. Schema-validated LLM extraction survives layout drift. ~$3/mo at daily cadence for 30 sources after pre-trimming. |
| Orchestration | Inngest (free tier 50k runs/mo) | Step-level durability, retries, concurrency limits, dashboard. Alternative: GitHub Actions cron if you want zero infra but will build observability yourself. |
| Change detection | sitemap `lastmod` → SHA-256 hash of normalized main content → skip LLM if unchanged | Cuts 70-90% of LLM cost week-over-week. |
| Storage | Supabase Postgres | GIN indexes on `wallet[]`, `category`, `valid_days[]`, `valid_regions[]`, plus a range index on `tope`, handle our query shape natively. |
| API serving | `/api/promos.json` materialized view, regenerated after each scrape run, served from Vercel Edge | Flat cost at scale — one cached JSON served globally instead of hitting Postgres per request. |
| Frontend | Next.js App Router + React Server Components + ISR, PWA via `next-pwa` | RSC keeps the list view near-zero client JS; filters as small client islands. |
| Observability | Per-source SLO table + Sentry + Discord/Telegram webhook on failure | Alert when any source returns 0 promos or goes >24h without a successful run. |

## Cost envelope (rough)

- 100 users — $0–5/mo (free tiers everywhere)
- 10,000 users — $25–40/mo (Supabase Pro $25 + LLM $3–10)
- 100,000 users — $80–150/mo (same + egress + possibly a proxy tier)

## Core patterns (non-negotiable)

### 1. Upsert-with-TTL, never hard-delete on scrape failure

When today's scrape of source X fails or returns zero promos, **keep yesterday's promos visible**. Every promo row has `last_seen_at`. The serving layer filters to anything seen in the last N days (N≈3 for weekly-changing promos). A promo is hard-deleted only after two consecutive successful scrapes confirm its absence.

### 2. Per-source SLO table

```sql
create table scrape_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  promo_count int,
  schema_valid boolean,
  raw_html_hash text,
  error text
);
```

Nightly health check: alert if any source has no successful run in the last 24h, or if the most recent run returned 0 promos while prior runs returned >0.

### 3. Pre-trim HTML before the LLM call

Use Firecrawl's `onlyMainContent: true` plus a per-site CSS container selector (`.promotions-list`, `#beneficios-grid`, etc.) to cut the HTML sent to the LLM by 5-10x. Full-page extraction explodes the bill and hurts accuracy.

### 4. Canonical `Promo` schema (Zod)

```typescript
const Promo = z.object({
  source_id: z.string(),                          // 'galicia' | 'modo' | 'dia' | ...
  source_url: z.string().url(),
  merchant: z.string(),                           // 'Carrefour', 'Coto', ...
  category: z.enum([
    'supermercado', 'farmacia', 'gastronomia', 'combustible',
    'transporte', 'indumentaria', 'electro', 'otro',
  ]),
  wallet: z.array(z.enum(['modo', 'mercadopago', 'cuentadni', 'uala', 'naranjax', 'personalpay', 'brubank'])),
  card_brand: z.array(z.enum(['visa', 'mastercard', 'amex', 'cabal', 'naranja'])).optional(),
  issuer_bank: z.array(z.string()).optional(),    // 'galicia', 'bbva', 'santander', ...
  pct: z.number(),                                // 20, 25, 30, or 0 for cuotas-only promos
  promo_type: z.enum(['cashback', 'cuotas', 'mixed']).default('cashback'), // 'cuotas' = pct=0, exclude from tope sort
  tope: z.number().nullable(),                    // ARS cap, null = sin tope
  tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable(), // null when tope is null (Sin tope)
  valid_days: z.array(z.number().int().min(0).max(6)),  // 0 = dom
  valid_regions: z.array(z.string()),             // ['CABA', 'GBA', 'AR-B', ...]
  valid_from: z.string().date(),
  valid_to: z.string().date(),
  requires_min_spend: z.number().nullable(),
  stacks_with: z.array(z.string()).optional(),    // other promo IDs this one stacks with
  variants: z.array(z.object({                    // for multi-rate promos (Supermiércoles-style)
    pct: z.number(),
    tope: z.number().nullable().optional(),
    tope_period: z.enum(['ticket', 'day', 'week', 'month']).nullable().optional(),
    category_scope: z.string().optional(),        // 'indumentaria', 'perfumería', 'Cartera General', ...
    notes: z.string().optional(),
  })).optional(),
  last_seen_at: z.string().datetime(),
});
```

This schema is the contract between ingestion (LLM extraction) and serving (filter/sort). Every scraper must emit rows that validate against it.

**Notes on the recent additions (April 2026, from `modo-stress-test.md`)**:

- `category` gained `transporte`, `indumentaria`, `electro` — all three appear on real MODO pages (transportevqr, Simplicity/Under Armour/Wrangler, Frávega/Megatone).
- `tope_period` is nullable because Sin-tope promos have no period.
- `promo_type` discriminator lets the serving layer exclude pct=0 cuotas-only rows from the cashback/tope ranking while still storing them for a "cuotas sin interés" tab.
- `variants` holds multi-rate promos like Supermiércoles-Santander (25% indumentaria + 10% perfumería) or Aiello-Supervielle (CG 20% / IDT+PS 25%). At query time, expand variants into separate sortable rows keyed by `source_url#category_scope`.

## Pitfalls to avoid

1. **Feeding full HTML to the LLM.** Always pre-trim.
2. **Hard-deleting promos when a scrape fails.** Use upsert-with-TTL.
3. **Writing per-site CSS parsers upfront for all 30 sources.** Start with LLM extraction everywhere; migrate to hand-written parsers only for the 3-5 highest-traffic, most-stable sources once data shows it's worth the maintenance.
4. **Vercel cron for long scrapes.** The 10s hobby-plan limit will bite. Use Inngest or GitHub Actions.
5. **Temporal, Kubernetes, or any "enterprise" orchestration.** Overkill; bleeds money and complexity at this scale.
