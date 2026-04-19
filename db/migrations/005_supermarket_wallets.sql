-- Phase 3.3: extend the wallet CHECK constraint with supermarket-native
-- loyalty/membership programs that function as own-cupon wallets (PromoArg
-- differentiator).
--
-- Additions (evidence trail):
--   comunidad_coto  — Coto Comunidad membership benefit: 15% miércoles sin tope
--                     sourced from coto.com.ar/descuentos/ and cotodigital.com.ar
--                     (see scripts/samples/long-tail/super/coto/*.md).
--   jumbo_mas       — Jumbo+ loyalty program powering the Jumbo-al-Cien
--                     pesoscheck cupon cycle (jumbomas.com.ar, sample:
--                     scripts/samples/long-tail/super/jumbo/jumbo-al-cien.md).
--   mi_carrefour    — Mi Carrefour loyalty program (referenced in Carrefour
--                     /descuentos-bancarios + some banking promos stack with it).
--
-- These are membership programs, not bank wallets, so they slot into the
-- `wallet` dimension rather than `issuer_bank`. They are genuine own-cupon
-- programs PromoArg does not source — our wedge.
--
-- Column stays; constraint is drop-and-recreate since Postgres has no
-- ADD-VALUE for CHECK-style array-subset constraints (same pattern as 002).

alter table promos drop constraint if exists promos_wallet_check;

alter table promos add constraint promos_wallet_check
  check (wallet <@ array[
    'modo', 'mercadopago', 'cuentadni', 'uala',
    'naranjax', 'personalpay', 'brubank',
    'bna_plus', 'prex', 'yoy', 'buepp',
    'lemon', 'astropay', 'reba',
    'comunidad_coto', 'jumbo_mas', 'mi_carrefour'
  ]::text[]);

-- Re-assert the Phase 3.3 cross-bank catalog source rows. The original 001 seed
-- covers these (`coto-descuentos`, `jumbo-descuentos`, `carrefour-descuentos-bancarios`),
-- but we refresh `notes` to reflect the VTEX BP dataentity finding on Carrefour
-- (all fields private — HTML fallback) and to document the Jumbo al 100 slug
-- rotation policy for the next agent.
insert into sources (id, display_name, tier, expected_cadence, notes) values
  ('coto-descuentos', 'Coto — cross-bank catalog',
   2, interval '7 days',
   'Cross-bank catalog. Two URLs: coto.com.ar/descuentos/ (physical) + cotodigital.com.ar/sitios/cdigi/descuentos (online). Includes Comunidad Coto 15% miércoles own-cupon.'),
  ('jumbo-descuentos', 'Jumbo — cross-bank catalog + Jumbo al 100',
   2, interval '7 days',
   'descuentos-del-dia bank promos + jumbo-al-cien pesoscheck cupon program. Monthly slug rotation (stable path); emission window documented in Jumbo al 100 card.'),
  ('carrefour-descuentos-bancarios', 'Carrefour — /descuentos-bancarios',
   2, interval '7 days',
   'Cross-wallet catalog incl. Cuenta DNI/Personal Pay/Ualá/Naranja X/BNA+/Prex. VTEX dataentity BP probed: all content fields private, id-only public. HTML fallback used.')
on conflict (id) do update set
  display_name     = excluded.display_name,
  tier             = excluded.tier,
  expected_cadence = excluded.expected_cadence,
  notes            = excluded.notes;
