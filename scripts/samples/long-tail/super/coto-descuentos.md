# Coto Digital /sitios/cdigi/descuentos — OPEN WEB CATALOG (GOLD)

Source: https://www.cotodigital.com.ar/sitios/cdigi/descuentos
Scraped: 2026-04-18 via Firecrawl (waitFor 5000). Status 200.

## Structure

Single page listing ~50+ bank-promo and own-cupon blocks, grouped by day of week (implicitly: Lunes / Martes / Miércoles / Jueves / Viernes / Sábado / Domingo). Each block:

- Bank/wallet logo (from `static.cotodigital3.com.ar/.../bancos/<name>.png`) — explicit source attribution
- Divider `---`
- Day phrase ("Lunes", "Lunes, Sábado y Domingo", "Sábado y Domingo", "De Lunes a Domingo", etc.)
- Heading: `### NN% descuento` OR `### NN cuotas sin interés`
- Subheading: applicable products / card / payment description
- Fine print: tope + vigencia + T&Cs

## Sample extracted promos (verbatim)

| Day | Bank | pct/cuotas | Tope | Category |
|---|---|---|---|---|
| Lunes, Sábado y Domingo | Credicoop | 30% descuento | $15.000 por usuario | toda la compra |
| Lunes, Sábado y Domingo | Credicoop Cabal Plan Sueldo | 40% descuento | $20.000 por usuario | un pago |
| Sábado y Domingo | Ciudad | 18 cuotas s/i | — | bazar/decoración/electro |
| Sábado y Domingo | Amex | 18 cuotas s/i | — | automotor/muebles/electro |
| De Lunes a Domingo | Galicia | 12 cuotas s/i | — | libros/automotor/muebles |
| De Lunes a Domingo | Macro | 12 cuotas s/i | — | libros/automotor/bazar |
| Lunes | Ciudad | 25% descuento | $10.000 semanal | todo |
| Lunes | ICBC | 20% descuento | $15.000 | un pago |
| Lunes | ICBC Sueldo | 30% descuento | $20.000 | un pago |
| Lunes | Santa Cruz | 30% descuento | sin tope | todo |
| Lunes | San Juan | 30% descuento | sin tope | todo |
| Lunes | Entre Ríos | 30% descuento | sin tope | todo |
| Lunes | Santa Fe | 30% descuento | sin tope | todo |
| Martes | TCI | 20% descuento | sin límite | un pago |
| **Martes** | **Naranja X Plan Turbo** | **25% descuento** | **$12.000 semanal** | **un pago crédito/débito NX** |
| Martes | Naranja X (sin plan) | 10% descuento | $3.000 semanal | — |
| Martes | Supervielle Visa/Master/Deb | 20% descuento | sin tope | un pago |
| Martes | Supervielle Identité | 25% descuento | sin tope | un pago |
| **Miércoles** | **Comunidad Coto** | **15% descuento** | **sin tope** | **todo, todos los medios de pago, siendo miembro** |
| Jueves | Comafi Débito Visa Electrón | 25% descuento | $13.000 / $18.000 (segmento único) | — |
| Jueves | Columbia Visa/Master | 30% descuento | sin tope | — |
| Jueves | Patagonia Débito Visa | 20% descuento | $25.000 | — |

(Many more rows — full catalog reads cleanly with fixed-label blocks.)

## Why this is huge

This IS a cross-bank promo catalog the chain curates itself — analogous to MODO's hub but for Coto specifically, AND it includes items MODO does NOT have:

- **Comunidad Coto 15% miércoles (sin tope)** — the supermarket-native cupon / membership benefit PromoArg misses
- **Naranja X Plan Turbo martes** — fintech promo surfaced here too
- Legacy regional banks (Santa Cruz, San Juan, Entre Ríos, Santa Fe) with "sin tope" deals the national sources miss

## Verdict

**Programmatically accessible, MODO-grade extractable.** 1 Firecrawl credit per refresh. LLM-extract with our canonical schema will work first-try.

**Also works for**: `coto.com.ar/descuentos/` (alternative same data).
