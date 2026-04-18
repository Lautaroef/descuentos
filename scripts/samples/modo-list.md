# MODO /promos — Firecrawl scrape (markdown, onlyMainContent=true)
# Captured 2026-04-18. Representative — re-run to refresh.

[Saltar al contenido principal](https://www.modo.com.ar/promos#main-content)

# Decile adentro a todas esas promos que querés

## Buscá por marca, rubro o comercio

### Carrusel (6 featured)
- Discovea marzo 2026 — https://www.modo.com.ar/promos/discovea-mar26
- Superdía marzo 2026 — https://www.modo.com.ar/promos/superdia-mar26
- Transporte VQR abril 2026 — https://www.modo.com.ar/promos/transportevqr-abril26
- La Anónima marzo 2026 — https://www.modo.com.ar/promos/laanonima-mar26
- Supermercado Toledo marzo 2026 — https://www.modo.com.ar/promos/supermercadotoledo-mar26
- Supers interior marzo 2026 — https://www.modo.com.ar/promos/supersinterior-mar26

### Destacadas
- Hasta 25% de reintegro y 6 cuotas en Supermiércoles (Santander) — /promos/supermiercoles-santander-info-mar26-jun26
- 20% de reintegro en COTO — /promos/coto-mar26
- Hasta 30% de reintegro y 9 cuotas en Especial Viernes (Santander) — /promos/especialviernes-santander-info-abr26-may26-jun26
- 3 cuotas sin interés en Farmacias (BNA) — /promos/3csi-farmacias-bna-mar24
- 10% y 3 cuotas en Veterinarias y Pet Shops (BNA) — /promos/10off-3csi-veterinarias-petshops-bna-mar25
- 10% y 3 cuotas en Ópticas (BNA) — /promos/10off-3csi-opticas-bna-mar25
- 10% de descuento en Carrefour — /promos/carrefour-mar26
- 50% de reintegro en Transporte — /promos/transportevqr-abril26
- 10% y 3 cuotas en Farmacias (jubilados BNA) — /promos/10off-farmacias-jubilados-tcbna-may25

### Supermercados
- 20% de reintegro en ChangoMás — /promos/20-comafi-changomas-feb26
- 20% de reintegro en Jumbo — /promos/jumbo-mar26
- 20% de reintegro en COTO — /promos/coto-mar26
- 10% de descuento en Carrefour — /promos/carrefour-mar26
- 20% de reintegro en Disco & Vea — /promos/discovea-mar26
- 20% de reintegro en La Anónima — /promos/laanonima-mar26
- 15% de reintegro en Supermercado Toledo — /promos/supermercadotoledo-mar26
- 20% de descuento en Diarco Barrio — /promos/diarco-barrio-mar-26
- 20% de reintegro en Supermercados Aiello — /promos/20-aiello-rm-supervielle-mar26

### Exclusivas en Tiendas On-line Web
- 15% de reintegro en Openfarma online — /promos/openfarma-abril26
- 10% de reintegro en Farmacias Acosta online — /promos/farmacia-acosta-abril26
- 9 cuotas sin interés en Almundo online — /promos/9-comafi-unico-almundo-ago25
- 20% de reintegro y 6 cuotas sin interés en Americars online — /promos/americars-marzo26
- 35% de reintegro en Farmacias Paradiñeiro online — /promos/paradineiro-online-feb26
- 20% de reintegro en Vacalin online — /promos/vacalin-abril26
- 15% de reintegro en Venti online — /promos/master-venti-mar26
- 3 cuotas sin interés en Almundo online — /promos/3-comafi-almundo-ago25
- 20% de reintegro en Under Armour online — /promos/underarmour-abril26

### Promos de financiación
(mostly cuotas-sin-interés, excluded from tope analysis)

### Más promos (long-tail)
~15 more cards — mix of 10–30% reintegro and cuotas-sin-interés.

## Observations
- The list/hub page contains title + category + slug + image, but NOT:
  - tope (ARS cap)
  - valid_days
  - valid_regions
  - min_spend
  - exact vigencia dates (they're encoded in the slug as `mar26`, `abr26`, etc.)
- Percentage is easy to regex from title ("Hasta 20% de reintegro", "20% de reintegro").
- Bank/issuer is sometimes in slug (santander, bna, comafi, macro, icbc, ciudad, supervielle, corrientes, bica) but not on the hub page visually.
- Issuer bank is a STRONG signal that MODO is the aggregation point for 10+ bank promos.
