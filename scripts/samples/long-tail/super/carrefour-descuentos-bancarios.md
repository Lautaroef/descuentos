# Carrefour /descuentos-bancarios — OPEN CROSS-WALLET CATALOG (MAJOR FIND)

Source: https://www.carrefour.com.ar/descuentos-bancarios
Scraped: 2026-04-18. Status 200. ~70 KB markdown. 1 credit.

## Structure

VTEX storefront but the descuentos-bancarios surface is static markdown with:
- 29+ distinct pct promos (10/15/20/25/30/35%)
- 52+ tope mentions (per-tarjeta, per-mes, per-semana caveats)
- All days of week present (Lun 12, Mar 10, Mié 27, Jue 6, Vie 6, Dom 1, + Todos los días)
- Images served from `carrefour.com.ar/api/dataentities/BP/documents/{uuid}/img_card_N/attachments/{wallet}.png` — suggests backing VTEX dataentity ("BP") holds the promo catalog. Potential API path to explore.

## Cross-wallet catalog included

Quoting the page (verbatim):

> "SERVICIO DE PROCESAMIENTO DE PAGOS DE LAS BILLETERAS VIRTUALES PARTICIPANTES DE LA PROMOCIÓN: CARREFOUR BANCO, MERCADO PAGO, CUENTA DNI, MODO, NARANJA X, UALÁ, BNA+, PERSONAL PAY, PREX Y TODAS LAS BILLETERAS VIRTUALES OPERATIVAS EN EL MERCADO ARGENTINO. EL BENEFICIO CONSISTE EN UN 10% DE DESCUENTO, SIN TOPE DE REINTEGRO, EN TU COMPRA EN TODAS LAS SUCURSALES DE HIPERMERCADOS CARREFOUR, CARREFOUR MARKET Y CARREFOUR EXPRESS"

**This is a Carrefour-issued promo that covers ALL major AR wallets including Cuenta DNI, Personal Pay, Ualá, Naranja X, BNA+, Prex** — i.e., chains occasionally run cross-wallet "universal" promos that are NOT in MODO.

## Other promos documented

- Mi Carrefour (own): referenced 3x
- Naranja: 16x (martes 10% and 25% Plan Turbo repeated)
- MODO: 7x (covered by Carrefour legal blocks, MODO Supervielle, etc.)
- Mercado Pago: 20x (multiple angles: QR, cuotas)
- Cuenta DNI: 4x (universal billeteras promo)
- Banco Patagonia: 28x (very strong presence)
- Banco Nación, Mi Carrefour Banco, Credicoop, Ciudad, Comafi, Supervielle, Ciudadanía Porteña, ANSES, ICBC, Columbia, Club La Nación all appear.

## Verdict

**Programmatically accessible, MODO-grade extractable.** This is another cross-issuer/cross-wallet catalog like Coto's `/descuentos` — it even surfaces Cuenta DNI and Personal Pay with explicit topes that Phase 1 classified as "unreachable".

Extraction pattern: same as MODO detail pages. Headline pct + tope + day-phrase + bank/wallet logo + legal block with vigencia. LLM + Zod schema works.

Cost: 1 Firecrawl credit per refresh. The dataentity URL pattern is a hint that the full catalog may be queryable via VTEX dataentities API (`/api/dataentities/BP/search?_fields=...`) — NOT tested in this investigation but flagged as a follow-up optimization that could avoid re-scraping HTML.
