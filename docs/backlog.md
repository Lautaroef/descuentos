# Backlog — Validated Demand Signals

Ideas that came up in real use and deserve future consideration. Not a commitment; a memory aid.

## Gastronomía (restaurants, cafes, bars)

**Source**: User's own in-the-moment question on 2026-04-19 at Allenby (Recoleta Urban Mall) — wanted to know the cheapest way to pay at a fine restaurant.

**Why this matters**: The "winning feeling" the product is built around isn't supermarket-specific. Every payment is a potential win, and gastronomía has arguably richer promo mechanics than supermarket:
- Weekend-focused bank promos (Cuenta DNI 25% Sábados/Domingos, ICBC ~30% on restaurants, Banco Nación gastronomía campaigns)
- Premium-card gastronomía programs (Macro Selecta, Galicia Eminent, Amex)
- Mall-level festivals (Recoleta Urban Mall's "Festival de Descuentos", Soy Shopping membership)
- Membership cards (Club La Nación, Clarín 365) that stack on bank promos
- Restaurant-specific bank partnerships the consumer-facing promo lists don't surface

**Current status**: Explicitly out of scope for v1 per `product.md` ("too local, too fragmented"). That was the right call at the time — we needed to prove the supermarket wedge first. Now that core ingestion works across 9 sources, gastronomía becomes a realistic scope-expansion candidate.

**Sources worth investigating if we pursue this**:
- MODO `/promos?category=gastronomia` (same extraction recipe we already use)
- Cuenta DNI press coverage (already have the pipeline)
- Mall websites (Recoleta Urban Mall, Alto Palermo, Abasto, Dot, Unicenter) — each publishes its own festival/membership benefits
- Premium-card benefit sites (macro.com.ar/selecta/beneficios, galicia.ar/eminent-beneficios, etc.) — most are structured like Brubank (fixed-label Webflow or similar)
- Clarín 365 / Club La Nación — consolidated third-party memberships

## Cuotas sin interés as an inflation-hedge "win"

**Source**: Same 2026-04-19 conversation.

**Why this matters**: Argentina's inflation makes "3-6 cuotas sin interés" materially valuable even when no percentage discount is involved — it's effectively a free loan in depreciating currency. Our current `Promo` schema captures `promo_type: 'cuotas'` and `pct: 0` cases, but the **ranking doesn't surface them as wins**. A user paying a $500k restaurant bill in 6 cuotas sin interés is "winning" meaningfully, and our UI currently buries that in a secondary tab.

**Product implication**: Phase 4 / 5 should add a "valor presente" calculation that treats N cuotas sin interés as a discount equivalent (at current ARS inflation rate) and ranks it alongside cashback promos. That changes the shape of the sort-by-tope wedge — it becomes sort-by-expected-value, which is the deeper thesis.

## Restaurant-specific split-the-bill optimizer

**Source**: Implicit from the 2026-04-19 discussion.

**Why this matters**: Phase 4 already plans a household-stack simulator for supermarket carts. The same math applies to restaurants: a $40k bill split between two people on Cuenta DNI (two $8k weekly topes) is different from one person paying. Gastronomía amplifies this because bill-splitting is the social default, not the exception.

**Product implication**: the household-stack simulator from Phase 4 generalizes naturally — same engine, different UX entry point.

## Bar for adding items here

- Validated by real use (user, a friend, a community post), not speculation
- Not just "would be cool" — there's a concrete payment moment where the current product doesn't win
- Briefly state the source (so we can trust it later) and the product implication (so it's actionable)
- Delete items when they ship or when we decide against them
