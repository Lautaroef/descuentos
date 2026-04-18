# Carrefour — cupon surfaces

## Tested URLs

- `https://www.carrefour.com.ar/especial-cupones` — HTTP 200, 1 credit. **Marketing-only** (explainer page with "¿Cómo usar tus cupones?" steps + FAQ). No listing of cupones.
- `https://www.carrefour.com.ar/promociones` — HTTP 200, ~85 KB markdown, 1 credit. Large page with category tabs but the scrape surfaces only headline banners ("ELECTRO BLACK! Hasta 18 CSI y hasta 30% OFF") and "Mi Carrefour" references. Does **not** render the actual per-card bank/pct/tope structured list that Coto does.
- `https://www.carrefour.com.ar/descuentos-bancarios` — 200 (found via map). Likely contains the per-bank promo list (not yet scraped due to time).
- `https://www.carrefour.com.ar/app` — marketing for Mi Carrefour app. Quote: *"Activá tus cupones en la App y disfrutá beneficios exclusivos en cada compra."* → cupones live in the app.
- `https://compromisos.carrefour.com.ar/ticket_masbajo.html` — "If your ticket isn't the lowest, we return 2x the difference. Generate your cupon and redeem next purchase." — transactional cupon, not a catalog.
- `https://compromisos.carrefour.com.ar/promo_garantizada.html` — in-aisle QR codes for self-generated cupones. In-store mechanic, not web-accessible.
- `https://beneficiarios.carrefour.com.ar` — auth-gated (login: "Descuento Equipo Carrefour" — internal staff).
- `https://landings.carrefour.com.ar/masresponsablesquenunca/beneficiarios.html` — ANSES 10% Lunes-Jueves with Mi Carrefour.

## App: Mi Carrefour (iOS + Android)

- iOS: https://apps.apple.com/nl/app/mi-carrefour-cupones-y-ahorro/id605788142
- Android: https://play.google.com/store/apps/details?id=com.munrodev.crfmobile
- Google Play listing confirms: "Pago Ágil: Paga y aplica todos tus cupones y descuentos en un solo clic."
- Per-user cupones live inside the app. No documented public API. Requires login.

## VTEX coupon-endpoint probe

Direct probes (curl):
- `/api/catalog_system/pub/coupons` — 404 (Día, Carrefour, Jumbo)
- `/api/checkout/pub/coupons` — 404
- `/api/io/coupons` — 200 but returns the VTEX SPA shell HTML, not JSON
- `/api/catalog_system/pub/promotions` — 404

No public VTEX coupon API exists on any of the three stores.

## Verdict

**Auth-gated for per-user cupones (in-app).** The public web has a `/descuentos-bancarios` page that is the bank-promo catalog (not yet deeply tested — likely scrapeable), similar to Coto's `/sitios/cdigi/descuentos`. But **Mi Carrefour app cupones are locked**. To surface Mi Carrefour cupones, only press-article coverage is available (e.g., "10% Lunes-Jueves Anses + Mi Carrefour").

Recommendation: scrape `/descuentos-bancarios` (same tier as Coto) + reference press for Mi Carrefour cupones. Do not attempt to reverse-engineer the app.
