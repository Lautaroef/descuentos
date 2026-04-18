# Jumbo /descuentos-del-dia + /jumbo-al-cien — OPEN WEB CATALOG

Sources:
- https://www.jumbo.com.ar/descuentos-del-dia — day-filtered bank promos
- https://www.jumbo.com.ar/jumbo-al-cien — Jumbo's own pesoscheck cupon program
- https://www.jumbo.com.ar/eventos/descuentos-jumbo-prime — Jumbo Prime loyalty

Status: 200. VTEX-hosted (store_framework generator `vtex.render-server@8.179.3`) but promo surface is static markdown.

## /descuentos-del-dia structure

- Top-nav filters: Por día (Lun-Sáb), Por banco, Cenco Pay, Planes de Financiación.
- Each promo block: bank/wallet logo + heading `#### NN% Dto.` or `#### NN cuotas sin interés` + subheading + fine print with vigencia + tope.

## Sample extracted promos (verbatim)

| Day | Bank/Issuer | pct / cuotas | Tope | Vigencia |
|---|---|---|---|---|
| Todos los días | Visa/Mastercard | 3 cuotas s/i | — | 01/12/25–30/04/26 |
| Jue/Vie/Sáb/Dom (online) | Galicia | 3 cuotas s/i | — | 02/01/26–30/04/26 |
| Todos los días | Cencopay (Cenco crédito) | 24 cuotas s/i | — | 10/04/26–30/04/26 |
| Todos los días | Cencopay | 12 cuotas s/i | — | — |
| Todos los días | Cencopay | 3,6,12 cuotas s/i | — | 01/01/26–30/04/26 |
| Todos los días | Galicia | 12 cuotas s/i en Electro | — | — |
| Todos los días | Macro | 6 y 12 cuotas s/i | — | 01/12/25–30/04/26 |
| **Sábados** | **Patagonia Visa** | **30% Dto.** | **$20.000/mes** | **04/04–30/04/26** |
| **Sábados** | **Patagonia Visa (supermercado)** | **35% Dto.** | **$25.000/mes** | **04/04–30/04/26** |
| Todos los días | Santander Online | 3 cuotas s/i | — | 01/04–30/04/26 |
| Todos los días | Santander | 12 cuotas s/i Electro | — | 01/02–30/04/26 |
| Todos los días | Comafi | 3 cuotas s/i | — | 01/12/25–30/04/26 |
| Vie/Sáb/Dom | Comafi | 12 cuotas s/i Electro | — | 01/12/25–30/04/26 |
| Todos los días | Banco Nación | 12 y 6 cuotas s/i Electro | — | — |
| Todos los días | Naranja X Plan Z | 3 cuotas s/i | — | 01/01–30/04/26 |
| Todos los días | Naranja X | 6 cuotas s/i Electro | — | 01/01–30/04/26 |

## /jumbo-al-cien (pesoscheck program — Jumbo's own cupon)

- Fecha de emisión: 06–08/03/2026 (rotates month-by-month)
- Fecha de canje: 13–15/03/2026
- Mecanica: compras productos marcados 100%/70%/50% → recibe pesoscheck físico → canjea contra próxima compra.
- Requires: estar adherido a Jumbo+ (programa de puntos, registro gratuito en jumbomas.com.ar)
- Tope/restricciones: max 10 cupones por compra, 6 unidades por SKU, no aplica electro/indumentaria.
- Doesn't stack con descuento bancario del día.

## Verdict

**Programmatically accessible**. 1 credit per hub page. Bank-promo blocks extract cleanly. Jumbo-al-cien rotates (monthly slug suffix implicit — re-crawl monthly).

**PromoArg gap**: Jumbo pesoscheck program is NOT in PromoArg. Differentiator.
