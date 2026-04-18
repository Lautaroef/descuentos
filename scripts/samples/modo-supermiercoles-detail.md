# MODO detail page — Supermiércoles Santander (reference sample)
# URL: https://www.modo.com.ar/promos/supermiercoles-santander-info-mar26-jun26
# Captured 2026-04-18 via firecrawl_scrape

Supermiércoles Santander

# Supermiércoles Sorpresa con Santander

Hasta 25% de reintegro...

## Tope de reintegro
¡Sin tope!   <-- explicit null case for our schema

## Cuotas
1, 2, 3, 4, 5 y 6 cuotas sin interés

## Modalidad de uso
Presencial QR y NFC

## Días que aplica
L M X J V S D   <-- icon row (all letters rendered the same way; legal text disambiguates)

## Vigencia
Del 24/03/26 al 24/06/26

## Bancos adheridos
Santander (only)

## Medios de pago
Visa Crédito, Visa Débito (only Visa per legal text)

## Legal text (snippet)
"Válida los días miércoles, del 25/03/2026 al 24/06/2026 (con excepción del 17/06/2026),
en los locales adheridos, abonando con QR a través de la App Santander o App MODO con
Tarjetas Santander Visa Crédito y/o Débito."

## Key takeaways
- "Sin tope" = null tope. Our schema has `tope: z.number().nullable()` — matches.
- valid_days: "los días miércoles" → [3] in our 0=Sunday scheme.
- issuer_bank: ["santander"]
- card_brand: ["visa"] (legal text excludes other brands)
- requires_min_spend: absent (none stated)
- Extra complexity: the 25% applies ONLY to Indumentaria + Sorpresa-subscribed customers;
  10% applies to perfumerías/joyerías/librerías. This is ONE promo URL but TWO real promos.
  Extraction MUST split these, or accept the "best-case" 25% and note the restriction in card_brand/merchant.
