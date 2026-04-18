# Ualá /promociones — OPEN WEB CATALOG

Source: https://www.uala.com.ar/promociones
Scraped: 2026-04-18 via Firecrawl, waitFor 6000.

## Structure

Hub: /promociones — Next.js (dynamic filters: tipo de promoción, tipo de comercio, día de la semana, medio de pago, rubro, ubicación).
Deep-link per-merchant pages: /promociones/{slug} (ej. /promociones/carrefour, /promociones/coderhouse, /promociones/sportclub, /promociones/ualabis).

## Hub sample promos

- Carrefour: **10% OFF** pagando con QR por caja
- Coderhouse: **20% descuento adicional** (Tarjeta Prepaga / Crédito)
- SportClub: **20% descuento** planes Total y Plus mensual
- Ualá Bis: **35% reintegro** en POS Pro

## Detail page structure (tested: /promociones/carrefour)

Detail pages use **MODO-grade fixed-label blocks**:

```
Días: L M M J V S D  [icon row w/ active-state CSS]
Métodos de pago: QR
Tipo de comercio: Físico
Válido hasta: Hasta el 30 de abril 2026
Tope de reintegro: Sin tope
Tiempo de acreditación: En el momento
Disponible en: Todo el país
Términos y condiciones: [full legal text with explicit días "sábados 4, 11, 18 y 25 de marzo de 2026", compras físicas only, no electrodomésticos, acumulable, etc.]
```

This is essentially the same structure as MODO — a LLM extract with Zod schema will produce clean records.

## Verdict

OPEN. Reachable via web. Detail pages are GOLD — fixed-label blocks same pattern as MODO. 1 credit per scrape.

**Phase-1 data-sources.md flag to update**: Ualá is NOT app-locked. Phase 1 was wrong on this.

Note: Ualá currently shows a relatively thin catalog (~4-10 merchants on hub). May need both `/promociones` + the merchant-slug list (mappable) for full coverage.
