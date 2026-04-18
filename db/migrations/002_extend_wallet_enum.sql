-- Extend the wallet CHECK constraint to cover every wallet surfaced in our
-- research corpus. Adding these up-front avoids first-run failures when the
-- Carrefour /descuentos-bancarios scraper sees `bna_plus` / `prex`, or when
-- a MODO detail page lists `yoy` / `buepp` as adhered billeteras.
--
-- Additions (evidence trail):
--   bna_plus   — Carrefour /descuentos-bancarios (long-tail-sourcing.md)
--   prex       — Carrefour /descuentos-bancarios (long-tail-sourcing.md)
--   yoy        — MODO mamuschka-macro sample (modo-stress-test.md)
--   buepp      — MODO mamuschka-macro sample (modo-stress-test.md)
--   lemon      — PromoArg /banco/lemon route (competitor-promoarg.md)
--   astropay   — PromoArg /banco/astropay route (competitor-promoarg.md)
--   reba       — PromoArg /banco/reba route (competitor-promoarg.md)
--
-- Drop-and-recreate the check constraint since Postgres has no ADD VALUE for
-- CHECK-style array-subset constraints. No data migration needed; column stays.

alter table promos drop constraint if exists promos_wallet_check;

alter table promos add constraint promos_wallet_check
  check (wallet <@ array[
    'modo', 'mercadopago', 'cuentadni', 'uala',
    'naranjax', 'personalpay', 'brubank',
    'bna_plus', 'prex', 'yoy', 'buepp',
    'lemon', 'astropay', 'reba'
  ]::text[]);
