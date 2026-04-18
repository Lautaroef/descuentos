# Naranja X /promociones — OPEN WEB CATALOG

Source: https://www.naranjax.com/promociones
Scraped: 2026-04-18 via Firecrawl, waitFor 6000.
Status: 200, client-side rendered but Firecrawl resolved it.

## Structure

SPA with filters (rubro, día, medio de pago, cuotas/descuentos, online/presencial). Each promo card:
- Headline: `Hasta NN% OFF` or `NN cuotas cero interés` or `Hasta 14 cuotas cero interés`
- Secondary: `Tope semanal hasta $NN.NNN` when cashback
- Date range: "Del 18 al 25 de abril", "Todos los martes", "Todos los días", "Hasta el 30 de abril"
- Merchant: "En supermercados", "Naldo", "Aerolíneas Argentinas", "Viajes Naranja X", ...
- Payment medium icons: Débito, Crédito, Dinero en cuenta, QR

## Sample extracted (verbatim from markdown)

- **Hasta 14 cuotas cero interés** — Especial electro — Del 18 al 25 de abril — Crédito
- **14 cuotas cero interés** — Naldo — Todos los días — Crédito
- **9 cuotas cero interés** — Aerolíneas Argentinas — Del 13 al 19 de abril — Crédito
- **12 cuotas cero interés** — Fiesta de la pintura — Del 13 al 20 de abril — Crédito
- **Hasta 25% OFF — Tope semanal hasta $12.000** — En supermercados — Todos los martes — Débito / Crédito / Dinero en cuenta / QR
- **Hasta 55% OFF** — Viajes Naranja X / hoteles del caribe — Hasta el 30 de abril
- Category pages: /promociones/SUPERMERCADOS_categoria, /promociones/medios/Super, /promociones-amba, /promos-relampago (Último sábado del mes, 40% OFF), /smartes, /verano

## Additional hubs discovered via map

- `/promociones-amba` — regional promos Buenos Aires ("15% de descuento aplicado en el momento, sin tope, compra mínima $35.000")
- `/smartes` — Smartes 2026 monthly sale days
- `/promos-relampago` — último sábado del mes 40% OFF hasta el tope
- `/blog/epico-y-turbo-planes-para-ahorrar-con-naranja-x` — details on Plan Épico + Plan Turbo topes ("25% off super martes tope $12.000", "25% McDonald's tope $9.000", "25% pago de servicios tope")
- `/pagar-transporte` — 100% OFF subte/colectivo

## Verdict

OPEN. Reachable via web. Category URLs + individual promo detail. Similar MODO-grade extractability (headline pct + tope + day-phrase). 1-2 credits per hub scrape. Per-merchant URLs accessible.

**Phase-1 data-sources.md flag to update**: Naranja X is NOT app-locked. Phase 1 was wrong on this.
