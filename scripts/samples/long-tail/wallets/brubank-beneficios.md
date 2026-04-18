# Brubank /beneficios — OPEN WEB CATALOG

Source: https://www.brubank.com/beneficios
Scraped: 2026-04-18 via Firecrawl (basic proxy, waitFor 5000)
Status: 200, fully rendered static markdown (Webflow), ~50 promo cards.

## Structure

Page is grouped by Plan tier (One / Plus / Ultra). Each card uses a fixed format:
- Headline: `NN% de reintegro` / `NN% de descuento`
- Line 2: merchant name (Axion Energy, Burger King, Cabify, Havanna, Farmacity, ...)
- Line 3: `Tope de reintegro: $N.NNN` (when applicable)
- Line 4: valid-days phrase ("Todos los días", "Los martes", "Viernes, sábados y domingos", "Lunes y viernes", ...)
- Deep link: help.brubank.com article with full T&Cs per promo

## Sample extracted promos (verbatim from markdown)

| Plan | Merchant | pct | tope | days |
|---|---|---|---|---|
| Ultra | Axion Energy | 30% reintegro | $6.000 | Todos los días |
| Ultra | Burger King | 30% reintegro | $6.000 | Todos los días |
| Ultra | Cabify | 40% reintegro | $6.000 | Todos los días |
| Ultra | Rapanui | 40% reintegro | $6.000 | Todos los días |
| Ultra | Cerini | 50% reintegro | $8.000 | Todos los días |
| Ultra | Le Pain Quotidien | 40% reintegro | $6.000 | Todos los días |
| Ultra | Freddo | 40% reintegro | $6.000 | Todos los días |
| Ultra | Simplicity | 30% reintegro | $6.000 | Todos los días |
| Ultra | App YPF | 10% reintegro | $6.000 | Lunes |
| Ultra | Havanna | 40% reintegro | $6.000 | Todos los días |
| Ultra | Farmacity | 30% reintegro | $6.000 | Todos los días |
| Plus | Axion Energy | 20% reintegro | n/a | Viernes, sábados y domingos |
| Plus | Burger King | 30% reintegro | n/a | Viernes, sábados y domingos |
| Plus | Cervelar | 30% reintegro | n/a | Viernes, sábados y domingos |
| Plus | Cerini | 50% reintegro | n/a | Todos los días |
| Plus | Cabify | 30% reintegro | n/a | Todos los días |
| Plus | Kusta Barber | 50% reintegro | n/a | Todos los días |
| One | Axion Energy | 10% reintegro | n/a | Martes |
| One | Biomac | 10% descuento | n/a | Todos los días |
| One | Cervelar | 20% reintegro | n/a | Miércoles |
| One | Eyelit | 30% reintegro | n/a | Jueves a domingos |
| One | Educación IT | 45% descuento | n/a | Todos los días |

(30+ more rows in scrape — full list in the raw Firecrawl response.)

## Verdict

Reachable via web. 1 Firecrawl credit per scrape. Catalog ~50 promos. Clean tope + valid_days extractable via LLM (same pattern as MODO).

Plan tier must be modeled: the schema may need a `required_plan` or `issuer_tier` field, OR each promo row should include the plan as part of `issuer_bank` (e.g., "brubank-ultra", "brubank-plus", "brubank-one").
