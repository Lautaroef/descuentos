# Descuentos AR

Argentine discount aggregator. Promos sorted by tope (cashback cap), filterable by owned wallet, region, day, and category. The product surfaces "what's the best deal for me today" instead of dumping a denormalized 55k-row catalog of expired offers.

**Live demo:** <https://descuentos-six.vercel.app/>

## Stack

- **Web**: Next.js 15 (App Router, RSC, ISR), React 19, Tailwind v4
- **DB**: Postgres on Supabase (`sa-east-1`), pooled connection from Vercel
- **Cron / orchestration**: Inngest (durable step functions, weekly + biweekly schedules, daily health check)
- **Extraction**: Firecrawl `/scrape` for HTML acquisition + Google Gemini 2.5 Flash for structured extraction (Zod-validated `Promo` schema). Hybrid B pattern documented in `docs/architecture.md`.
- **PWA**: Serwist service worker
- **Hosting**: Vercel

## Why this exists

Argentina has no consolidated promo feed. Each wallet (MODO, Cuenta DNI, Naranja X, Ualá, Brubank, Personal Pay) and each big retailer (Coto, Jumbo, Carrefour) publishes their own catalog in their own format. The closest existing aggregator (`promoarg.com`) shows ~55k denormalized rows including expired and BIN-restricted promos — useful for browsing, useless for "what should I pay with at the checkout right now?". This project picks the smaller, opinionated cut: sort by `tope`, filter by wallets the user actually owns, and only show promos seen in the last few scrape cycles.

## Data sources (9 ingestion adapters)

All schedules in `src/lib/inngest/schedules.ts`.

| Source | Mechanic | Cadence |
|---|---|---|
| MODO | Hub crawl + per-slug LLM extraction | Weekly (Mon 04:00 ART) |
| Coto `/descuentos` | HTML markdown → LLM | Weekly (Mon 05:00 ART) |
| Jumbo `/descuentos-del-dia` | HTML markdown → LLM | Weekly (Mon 05:00 ART) |
| Carrefour `/descuentos-bancarios` | HTML markdown → LLM | Weekly (Mon 05:00 ART) |
| Naranja X | 5 hub URLs → LLM | Weekly (Tue 04:00 ART) |
| Ualá | Per-merchant detail pages → LLM | Weekly (Tue 04:00 ART) |
| Brubank `/beneficios` | Webflow static page → LLM | Weekly (Tue 04:00 ART) |
| Personal Pay | Hub catalog → LLM (partial: no tope) | Weekly (Tue 04:00 ART) |
| Cuenta DNI | Press-article extraction (Ámbito / Infobae / iProUp) | Biweekly (1st + 15th, 04:00 ART) |
| Health check | Cadence + freshness staleness probe → webhook | Daily 09:00 ART |

Why no direct bank scraping (Galicia, Santander, Macro, Nación, etc.): those buscadores are Akamai-fortressed and the same promos surface inside MODO and the supermarket cross-wallet catalogs. One Medium-difficulty scrape beats ten Fortress-difficulty ones. See `docs/data-sources.md` for the full sourcing rationale.

## Local setup

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase / Firecrawl / Inngest / Gemini keys
pnpm migrate                       # apply DB migrations to the configured Postgres
pnpm dev                           # http://localhost:3000

# in another terminal, drive Inngest functions locally:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Run a single source by hand (no Inngest needed):

```bash
pnpm run-modo        # or run-coto / run-jumbo / run-carrefour / run-brubank / etc.
```

## Tests

```bash
pnpm test             # node:test — DB-free contract tests (schema, predicates, alerts, ids)
pnpm test:unit        # vitest — component + filter behaviour
pnpm test:e2e         # playwright — SSR-with-JS-disabled correctness
pnpm typecheck        # both tsconfigs (`src/` and `scripts/`)
```

## Architecture & decisions

- `docs/README.md` — reading order for new contributors
- `docs/architecture.md` — stack decision, upsert-with-TTL, per-source SLO table
- `docs/data-sources.md` — where each source lives, gotchas, why some banks are intentionally skipped
- `docs/cron.md` — Inngest orchestration, alert webhook, on-call playbook
- `docs/design/` — visual system, voseo microcopy guide, UX audit

## License

[MIT](./LICENSE) — copyright 2026 Lautaro Figueroa.
