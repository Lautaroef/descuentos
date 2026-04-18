-- Phase 0: initial schema.
-- Columns in `promos` mirror the canonical Zod type in scripts/promo-schema.ts.
-- Core patterns per docs/architecture.md: upsert-with-TTL keyed on (source_id, source_url),
-- scrape_runs for per-source SLOs, sources as static lookup.

-- pgcrypto for gen_random_uuid(); Supabase preloads it, but be explicit.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- promos
-- ---------------------------------------------------------------------------
create table if not exists promos (
  id                  uuid primary key default gen_random_uuid(),

  -- identity / provenance
  source_id           text not null,
  source_url          text not null,

  -- merchant & classification
  merchant            text not null,
  category            text not null
    check (category in (
      'supermercado', 'farmacia', 'gastronomia', 'combustible',
      'transporte', 'indumentaria', 'electro', 'otro'
    )),

  -- payment instruments
  wallet              text[] not null default '{}'
    check (wallet <@ array[
      'modo', 'mercadopago', 'cuentadni', 'uala',
      'naranjax', 'personalpay', 'brubank'
    ]::text[]),
  card_brand          text[]
    check (card_brand is null or card_brand <@ array[
      'visa', 'mastercard', 'amex', 'cabal', 'naranja'
    ]::text[]),
  issuer_bank         text[],

  -- discount shape
  pct                 numeric not null,
  promo_type          text not null default 'cashback'
    check (promo_type in ('cashback', 'cuotas', 'mixed')),
  tope                numeric,
  tope_period         text
    check (tope_period is null or tope_period in ('ticket', 'day', 'week', 'month')),

  -- temporal / regional validity
  valid_days          int[] not null default '{}',
  valid_regions       text[] not null default '{}',
  valid_from          date not null,
  valid_to            date not null,

  -- constraints & composition
  requires_min_spend  numeric,
  stacks_with         text[],

  -- multi-rate promos (Supermiércoles-Santander, Aiello-Supervielle, ...)
  variants            jsonb,

  -- TTL / audit
  last_seen_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),

  -- upsert key: a single promo is unique per source record
  constraint promos_source_url_unique unique (source_id, source_url)
);

-- Filter indexes. GIN for array containment queries used by wallet/day/region filters.
create index if not exists promos_wallet_gin        on promos using gin (wallet);
create index if not exists promos_issuer_bank_gin   on promos using gin (issuer_bank);
create index if not exists promos_valid_days_gin    on promos using gin (valid_days);
create index if not exists promos_valid_regions_gin on promos using gin (valid_regions);

-- Sort-by-tope is the wedge. nulls last so "sin tope" doesn't dominate the default sort;
-- product UI pins them to a separate section (see build-plan.md §2.2).
create index if not exists promos_tope_desc_idx   on promos (tope desc nulls last);
create index if not exists promos_last_seen_idx   on promos (last_seen_at);
create index if not exists promos_category_idx    on promos (category);

-- ---------------------------------------------------------------------------
-- scrape_runs  (per-source SLO table; architecture.md §"Per-source SLO table")
-- ---------------------------------------------------------------------------
create table if not exists scrape_runs (
  id              uuid primary key default gen_random_uuid(),
  source_id       text not null,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  promo_count     int,
  schema_valid    boolean,
  raw_html_hash   text,
  error           text
);

create index if not exists scrape_runs_source_started_idx
  on scrape_runs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- sources  (static config / lookup)
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id                 text primary key,
  display_name       text not null,
  tier               smallint not null check (tier in (1, 2, 3)),
  expected_cadence   interval not null,
  current_status     text not null default 'pending_first_run',
  notes              text
);

-- ---------------------------------------------------------------------------
-- Seed rows — extracted from docs/data-sources.md and docs/long-tail-sourcing.md.
-- Tiers: 1 = primary (MODO), 2 = supplementary/supermarket/wallet, 3 = manual / residual.
-- on conflict makes this script safe to re-run.
-- ---------------------------------------------------------------------------
insert into sources (id, display_name, tier, expected_cadence, notes) values
  -- Tier 1
  ('modo', 'MODO', 1, interval '7 days',
   'Primary feed. Hub + ~57 live detail slugs. Extract per slug with Firecrawl + Zod.'),

  -- Tier 2 — wallet catalogs
  ('cuenta-dni', 'Cuenta DNI (press extraction)', 2, interval '30 days',
   'Press-article LLM extraction (Ámbito/Infobae/iProUp). Triangulate across >=2 outlets.'),
  ('brubank', 'Brubank', 2, interval '7 days',
   'Fully rendered Webflow catalog at brubank.com/beneficios (~50 cards, plan tiers).'),
  ('naranjax', 'Naranja X', 2, interval '7 days',
   'Hub + category pages + Plan Turbo/Épico tiers; SPA, waitFor ~6000ms.'),
  ('uala', 'Ualá', 2, interval '7 days',
   'Hub + per-merchant detail pages with MODO-grade fixed-label blocks.'),
  ('personalpay', 'Personal Pay', 2, interval '7 days',
   'PARTIAL: merchant+pct+days from web; topes triangulated from press articles.'),

  -- Tier 2 — supermarket-native cross-wallet catalogs (PromoArg differentiator)
  ('coto-descuentos', 'Coto — /descuentos', 2, interval '7 days',
   'Cross-bank catalog + Comunidad Coto own-cupon. coto.com.ar/descuentos.'),
  ('jumbo-descuentos', 'Jumbo — /descuentos-del-dia', 2, interval '7 days',
   'Cross-bank catalog; Jumbo al 100 pesoscheck program re-scraped monthly.'),
  ('carrefour-descuentos-bancarios', 'Carrefour — /descuentos-bancarios', 2, interval '7 days',
   'Cross-wallet catalog incl. Cuenta DNI, Personal Pay, Ualá, Naranja X, BNA+, Prex.'),

  -- Tier 2 — VTEX supermarket catalogs (no tope; feeds the "cuotas sin interés" tab)
  ('dia', 'Día (VTEX)', 2, interval '7 days',
   'VTEX catalog_system API. No tope field — feeds the cuotas/no-tope tab, not the wedge sort.'),
  ('carrefour', 'Carrefour (VTEX)', 2, interval '7 days',
   'VTEX catalog_system API. Same shape as Día. Cuotas/no-tope tab only.'),
  ('jumbo', 'Jumbo (VTEX)', 2, interval '7 days',
   'VTEX catalog_system API. Cuotas/no-tope tab only.'),
  ('disco', 'Disco (VTEX)', 2, interval '7 days',
   'VTEX catalog_system API. Cuotas/no-tope tab only.'),
  ('vea', 'Vea (VTEX)', 2, interval '7 days',
   'VTEX catalog_system API. Cuotas/no-tope tab only.'),
  ('changomas', 'ChangoMás (VTEX)', 2, interval '7 days',
   'VTEX catalog_system API. Cuotas/no-tope tab only.'),

  -- Tier 2 — Mercado Pago Promociones (cuotas sin interés / %-off ecomm; no tope)
  ('mp-promociones', 'Mercado Pago Promociones', 2, interval '7 days',
   'Elementor WordPress + REST taxonomy. Cuotas/no-tope tab; regex extraction sufficient.')
on conflict (id) do update set
  display_name     = excluded.display_name,
  tier             = excluded.tier,
  expected_cadence = excluded.expected_cadence,
  notes            = excluded.notes;
