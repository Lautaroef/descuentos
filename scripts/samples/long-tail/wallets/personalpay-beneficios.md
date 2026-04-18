# Personal Pay /beneficios — OPEN WEB CATALOG (PARTIAL)

Source: https://www.personalpay.com.ar/beneficios (resolves to https://www.personal.com.ar/pay/beneficios)
Scraped: 2026-04-18 via Firecrawl, waitFor 6000.

## Structure

AEM/custom stack. Hub has:
- Category filter chips: Heladerías, Turismo, Electro y Tecno, Gastronomía, Indumentaria, Entretenimiento, Salud y belleza, Pago de servicios, Recargas, Compras, Automotor, Educación, Supermercados, Fast Food, Cines.
- Merchant grid rendered from a JSON-ish partner API: `https://beneficiosclub.personalpay.dev/partner/<slug>.png` — suggests a backing beneficiosclub subdomain worth probing.
- Paginated: 8 pages × ~12 merchants = ~96 partners total.
- Each card shows: merchant name + pct + day(s) (e.g., "Farmacia Central Oeste / 20% / Miércoles", "Lázaro / 20% / Lunes, Martes", "Taxi Premium / 30% / Lunes a Miércoles").
- **But tope data lives in IMAGES** (`Desk_tabla_v2.webp` summarizes by Nivel 1/2/3 tier). Requires image OCR or the backing API.

## Critical finding — backing API subdomain

`beneficiosclub.personalpay.dev` — the image URLs on the page point here. This is a developer subdomain that could serve the partner list as JSON. Worth probing in a follow-up (NOT part of this 25-min investigation but flagged).

Press article confirms the tier/tope schema: "Personal Pay Nivel 3" gives 20% reintegro tope $8.000 combustibles/super, $3.500 servicios Flow/Personal. Nivel requires $150.000+ gasto mes anterior.

## Sample extracted from hub

| Merchant | pct | days |
|---|---|---|
| Farmacia Central Oeste | 20% | Miércoles |
| Farmalife | 10% | Todos los días |
| Go Bar | 15% | Todos los días |
| Lázaro | 20% | Lunes, Martes |
| Personal Flow | 25% | Todos los días |
| Personal Flow (servicios) | 10% | Todos los días |
| Recargas Movistar prepago/Tuenti | 20% | Todos los días |
| Recargas Personal | 20% | Todos los días |
| Supermercado La Reina | 10% | Sábado |
| Taxi Premium | 30% | Lunes a Miércoles |
| Tienda Personal | 15% | Todos los días |

## Verdict

PARTIAL-OPEN. Merchant list + pct + valid_days are on the rendered hub. Topes are in images → need OCR OR (better) probe the `beneficiosclub.personalpay.dev` subdomain for structured data. For the "ranked-by-tope" wedge, the press-article path is currently the cleaner source for Personal Pay topes.

**Phase-1 data-sources.md flag to update**: Personal Pay is partially reachable via web. Not fully app-locked.
