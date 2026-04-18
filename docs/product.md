# Product Thesis

## Problem

Argentina has one of the richest bank/wallet promo ecosystems in Latin America, and **no tool ranks promos by who gives the most money back today**. Existing tools all fall short:

- **PromoArg** — best coverage, filters by bank/category/day. No sort-by-tope. AI assistant still under construction.
- **Clash** — B2B-first (merchants push their own promos). No cross-source ranking.
- **MODO** — bank-ecosystem only. No Mercado Pago, no Cuenta DNI.
- **Mercado Pago / Cuenta DNI / Naranja X / Personal Pay** — each siloed to its own ecosystem.
- **Supermarket apps (Mi Carrefour, Mi Coto, Jumbo Más)** — each shows only its own cupones.

Structurally, the Argentine discount landscape has **three incompatible silos** (bank-issued / MODO, Mercado Pago, Cuenta DNI) plus fintechs plus supermarket apps. No tool sees across all of them.

## Target user

Argentine deal-hunter. Spends deliberately. Willing to walk 5–10 min to a different supermarket or move money between wallets if the reward is meaningfully higher. Today relies on a patchwork:

- Monthly infographic from r/DescuentosArgentina
- Twitter curators (@ahorrotwit, @AhorrandoAndoAr, @tbdescuentos)
- Checking MODO + Mercado Pago + Cuenta DNI separately
- Mental math on topes

## The wedge — four features, none of the 8 competitors does all four

1. **Sort promos by tope (cashback cap) high-to-low** within a chosen category.
2. **Filter to wallets/cards the user owns**, and show a secondary "if I opened X, I'd unlock Y more pesos this month" view so users can find accounts worth opening.
3. **Region-aware** (CABA, GBA, provincias). Promos that don't apply in the user's zone should not show.
4. **Household-stack simulator** — given N family members with their wallets, compute the optimal split of a $X cart across tickets to maximize total reintegro.

## Success criteria (personal-use phase)

- User saves >20 minutes/week vs. the current Reddit-PNG + Twitter workflow.
- For a typical monthly supermarket budget, the tool surfaces at least one deal the user would have missed.
- Data stays fresh enough that the user trusts it without double-checking in the issuing bank's app.

## Out of scope for v1

- Price comparison across supermarkets (Ratoneando already owns that niche).
- Restaurants / gastronomía (too local, too fragmented). Supermarket + farmacia first.
- Native iOS/Android apps — PWA covers both. Native only if PWA limits bite.
- Monetization. Personal use first; commercial model is a later decision.
