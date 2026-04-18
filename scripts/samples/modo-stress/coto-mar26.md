# COTO mar26 — Firecrawl markdown scrape (2026-04-18)
# Source: https://www.modo.com.ar/promos/coto-mar26
# Credits: 1 (scrape only). Extract: 30 credits (v1), 27 credits (v2 with reasoning).

20% en COTO

# COTO

20% de reintegro

Mostrar comercios adheridos

Tope de reintegro
$25.000 por banco por mes

Monto mínimo de compra
$60.000

Modalidad de uso
Presencial QR y NFC

Días que aplica
L M X J V S D   (icon row — LLM reads all 7 flat in markdown)

Vigencia
Del 28/02/26 al 30/04/26

Bancos adheridos (icon strip +13): Nación, Galicia, BBVA, Santander, Macro, ICBC + 13 more

## Legal text (truncated)

2. **Vigencia**
Desde las 00:00 horas del día 01 de marzo de 2026 hasta las 23:59 horas del día 30 de abril de 2026, ambas fechas inclusive o hasta alcanzar la suma de $2.571.000.000 en concepto de reintegros otorgados a los usuarios (lo que ocurra primero).

3. **Elegibilidad**
3.1 Realicen un pago por un monto mayor o igual a $60.000 (sesenta mil pesos) **los días MARTES** en los comercios adheridos...

## Entidades Adheridas (Para pagos con QR):
- Banco Santander (Sólo con VISA)
- Banco Nación
- Banco Galicia
- Banco BBVA
- Banco Macro
- Banco Santa Fe
- Banco Entre Rios
- Banco San Juan
- Banco Santa Cruz
- Banco ICBC
- Billetera YOY
- Banco Supervielle
- Banco Credicoop
- Banco Ciudad
- Billetera BUEPP
- Banco Bancor
- Banco Comafi
- Banco Columbia (Sólo en app bancaria)
- Banco del Sol

---

## rawHtml weekday evidence (CRITICAL)

The L/M/X/J/V/S/D icon row in rawHtml uses `data-testid` to encode active state:
- Inactive: `<span data-testid="day-of-week-L">L</span>`
- Active:   `<span data-testid="day-of-week-selected-M">M</span>`   ← only MARTES selected for COTO

Regex-extractable without LLM.

## Canonical extracted fields (v2 prompt with valid_days_reasoning REQUIRED)

```json
{
  "merchant": "COTO",
  "category": "supermercado",
  "pct": 20,
  "tope": 25000,
  "tope_period": "month",
  "valid_days": [2],
  "valid_days_reasoning": "Los días MARTES",
  "valid_regions": [],
  "valid_from": "2026-03-01",
  "valid_to": "2026-04-30",
  "requires_min_spend": 60000,
  "issuer_bank": ["nacion","galicia","bbva","santander","macro","icbc","supervielle","credicoop","ciudad","bancor","comafi","columbia"],
  "wallet": ["modo"]
}
```
