# Phase 2 Notes — Minimal UI Shipped

Date: 2026-04-18. Scope: Phase 2.1–2.5 of `docs/build-plan.md`. Section 2.4
("materialize `/api/promos.json`") was deliberately skipped — 40 rows served
directly from Postgres via RSC is well under any revalidate budget; we defer
that edge-materialization optimization until we have real traffic data.

## Deployment

- **Production URL**: <https://descuentos-six.vercel.app>
- Canonical preview: `https://descuentos-6ik90604v-lautaroefs-projects.vercel.app`
- Vercel project: `lautaroefs-projects/descuentos` (`.vercel/project.json`)
- All ten required env vars pushed to Vercel production via `vercel env add`.

## What shipped

| Path | Role |
|---|---|
| `src/app/layout.tsx` | Root layout, `lang="es-AR"`, manifest ref, OG metadata, dark theme color. |
| `src/app/page.tsx` | Home list. Sort by tope DESC NULLS LAST, pct tiebreak. Stats banner. |
| `src/app/p/[id]/page.tsx` | Detail page keyed on canonical UUID (PromoArg URL-shape parity). Full schema fields + source CTA + legal disclaimer. |
| `src/app/banco/[slug]/page.tsx` | SEO landing for 24 issuer banks. `generateStaticParams` over `BANK_SLUGS`. Pinned bank filter + meta with today's date. |
| `src/app/categorias/[slug]/page.tsx` | SEO landing for 8 category enum values. Same pattern. |
| `src/app/sitemap.ts` | /, /banco/*, /categorias/*, /p/<uuid>* with `lastModified: promo.last_seen_at`. |
| `src/app/robots.ts` | Allow all; disallow `/api/*`. |
| `src/app/manifest.ts` | PWA manifest. Standalone display, dark theme, es-AR, SVG + PNG icons. |
| `src/app/sw.ts` | Serwist service worker. Navigation preload + default runtime cache (NetworkFirst for HTML, SWR for statics). |
| `src/app/not-found.tsx` | 404 page. |
| `src/components/PromoCard.tsx` | List card — pct, tope, days, first 3 banks, verified-ago, deep link. |
| `src/components/PromoList.tsx` | Grid + collapsible "Sin tope" secondary section. |
| `src/components/FilterBar.tsx` | Client island. Multi-select wallet + rubro, single-select día + región. Every change rewrites the URL (SSR-true). LocalStorage persistence for wallets. |
| `src/components/OnboardingSheet.tsx` | First-visit sheet asking which wallets the user owns. Sets localStorage + seeds URL. |
| `src/lib/db.ts` | Postgres singleton. Prefers `DATABASE_POOLER_URL` in production (Supabase pgbouncer transaction mode, safer for Vercel serverless). |
| `src/lib/schema.ts` | Pure TS types mirroring `scripts/promo-schema.ts`. |
| `src/lib/filters.ts` | Pure URL-params → PromoFilter parser. Fully unit-tested. |
| `src/lib/queries.ts` | Server-only SQL layer. `listPromos`, `getPromoById`, `listPromoSitemap`, `getPromoStats`. Always applies the 3-day TTL gate per `architecture.md`. |
| `src/lib/constants.ts` | Slug sets + Spanish labels for banks, wallets, categories, regions, days. |
| `src/lib/format.ts` | es-AR money, pct, valid_days phrasing, relative-time ("verificado hace X"). |
| `public/icon.svg` | Minimal PWA icon. |
| `next.config.ts` | Serwist wrapper; tracing excludes for `scripts/` / `db/` / `docs/`. |
| `tsconfig.json` | Next-side config (`moduleResolution: bundler`). |
| `tsconfig.scripts.json` | Ingestion-side config (`NodeNext`) kept separate so Phase 1 CLI scripts still run. |

## Build artifacts

| Command | Result |
|---|---|
| `pnpm typecheck` | clean (both tsconfigs) |
| `pnpm test` | 32/32 pass (`src/lib/queries.test.ts` + the Phase 1 `scripts/tests/modo-extract.test.ts`) |
| `pnpm build` | ✓ 39 routes generated (1 home, 1 detail dynamic, 24 bank SSG, 8 category SSG, sitemap, robots, manifest, 4 utility) |

## Key UX + architecture decisions

1. **Direct Postgres, no `/api/promos.json`.** Build plan §2.4 suggests
   materializing to the edge; we deferred because 40 rows at ISR-1h is trivial
   and the added complexity doesn't pay off yet. Revisit when we see traffic
   shape in week-1 telemetry. Noted in `build-plan.md`.

2. **Shared-type strategy: inline mirror, not re-export.** `src/lib/schema.ts`
   duplicates the TypeScript shape of `scripts/promo-schema.ts` rather than
   re-exporting. Reason: `scripts/` is under a different tsconfig module mode
   (`NodeNext` with `.js` import specifiers) that won't cleanly resolve from
   Next's `bundler` mode. Two files, both authoritative — if you change one,
   change the other. Keeps each side clean.

3. **Pooler URL preferred in prod.** `src/lib/db.ts` checks `VERCEL === '1'`
   (or `NODE_ENV=production`) and selects `DATABASE_POOLER_URL` — the
   transaction-mode pooler is correct for Vercel serverless. Direct
   `DATABASE_URL` remains the default for local `next dev` and CLI scripts.

4. **Filter bar is a client island, but truth is the URL.** The bar reads
   `useSearchParams()` and rewrites via `router.push()`. This keeps the SSR
   story honest: a link with `?wallet=modo&rubro=supermercado&dia=3&region=CABA`
   renders the correct HTML on a fresh tab with JS disabled. PromoArg's
   filters are JS-only; ours are not.

5. **Collapsible "Sin tope" section instead of a tab.** Build plan §2.2 calls
   the tab out as Phase 4. We put the 15 no-tope promos in a single
   togglable group below the main ranking — visible, but not polluting the
   sort. This is still the minimal UX that satisfies product.md without
   reaching into Phase 4.

6. **Onboarding sheet on first visit, not every visit.** `localStorage` flag
   `descuentos-ar:onboarded` is set whether the user saves or skips. The
   selected wallets land in `descuentos-ar:owned-wallets` and the filter bar
   reads this on mount if the URL has no `wallet=` param.

## Vercel gotchas hit

1. **Stray `~/package-lock.json`** in the user's home dir made Next warn
   "multiple lockfiles". Fixed with `outputFileTracingRoot: process.cwd()` in
   `next.config.ts` — no home-dir edit needed.

2. **`server-only` is not a transitive dep.** It's a separate package that
   `src/lib/queries.ts` relies on to enforce the server boundary. Added as a
   direct dep.

3. **Next.js 15 auto-patched `tsconfig.json`.** It added `allowJs: true` on
   first build. We kept that write.

4. **lucide-react 1.8.0 ships via pnpm's default resolution.** It's an
   older / alternate publish of the icon set. All imports we use (`ArrowRight`,
   `ExternalLink`, `ChevronDown`, `X`, `RotateCcw`, `ArrowLeft`) exist and
   work. If Phase 4 polish wants a wider selection, upgrade to the modern
   0.x line under the same package name.

## Installing the PWA

**iOS (Safari)**:
1. Open <https://descuentos-six.vercel.app> in Safari (not Chrome).
2. Tap the share icon → scroll → **Add to Home Screen**.
3. Confirm the name ("Descuentos"). The dark theme color should flash once
   when opening; subsequent launches run standalone.

**Android (Chrome)**:
1. Open <https://descuentos-six.vercel.app>.
2. Menu (⋮) → **Install app** (or "Add to Home Screen").
3. The manifest declares `display: standalone`; launcher icon uses
   `/icon.svg`.

**Desktop (Chrome/Edge)**: address-bar install icon appears once the service
worker registers. Fine for ad-hoc testing; phone is the primary target.

## What to test in week 1

From `product.md` success criteria:

1. **Sort-by-tope is useful.** Default home view is sorted by the metric we
   care about. Is the top of the list materially better than what you'd pick
   off the Reddit PNG?
2. **Owned-wallet filter saves time.** After onboarding, confirm the default
   home URL shows only promos on your wallets — no more scrolling past
   Mercado Pago promos when you don't use MP.
3. **SSR filter links are shareable.** Share `…/?rubro=supermercado&dia=3`
   in WhatsApp; the link should open to the exact filtered view.
4. **Bank landing pages work.** `/banco/galicia` and `/banco/santander`
   should match what you'd expect. If you see no promos on a bank that you
   know has active promos, that's a coverage gap (Phase 3 will fix with more
   sources).
5. **"Verificado hace X" matches reality.** The phase-1 ingest ran on
   2026-04-18; expect "hace X días" where X grows with time. If you run
   `pnpm run-modo` to re-ingest, `last_seen_at` will reset on unchanged
   rows — verify the timestamp reflects the latest run.
6. **PWA installability on iOS + Android** as above.

## Known gaps / deferred to Phase 4

- **OG images** — not generated. `generateMetadata()` sets titles +
  descriptions; no custom OG PNG per promo. Nice-to-have, not blocking
  personal use.
- **`last_verified_at` color thresholds** (green/yellow/red). We show the
  relative-time string; the color system is a Phase 4 differentiator.
- **Dedup** — two sources emitting the same underlying promo will currently
  show as two cards. Phase 1 only has MODO so this hasn't bitten; will
  matter when Phase 3 lights up.
- **Opportunity view** — "If I opened Naranja X I'd unlock $X". Phase 4.
- **Household simulator.** Phase 4.
- **User-correction form.** Phase 4.
- **Source-quality score visualization.** Phase 4.
- **Sin-tope dedicated tab.** For now we collapse them; Phase 4 promotes to
  its own route if the user actually cares about cuotas.
- **`/api/promos.json` edge-cached JSON.** Deferred; 40 rows is trivial.
- **Inngest cron** (Phase 1.5). Vercel endpoint now exists; next agent in
  Phase 3 can wire it up.

## Smoke-test results (post-deploy)

```
curl -sI https://descuentos-six.vercel.app/          → HTTP/2 200
curl -sI .../p/c9a9f210-…-b59b-0fbd50eaf535           → HTTP/2 200
curl -sI .../banco/galicia                            → HTTP/2 200
curl -sI .../categorias/supermercado                  → HTTP/2 200
curl -sI .../sitemap.xml                              → HTTP/2 200
curl -sI .../manifest.webmanifest                     → HTTP/2 200
curl -s .../ | grep -oE 'Aiello|COTO|Carrefour|25%'   → all present
```

## Cost

- Vercel: free tier. 1 production deploy used. Build took ~1 minute.
- Supabase: free tier. SELECT over 40 rows. Not a concern.
- Total Phase 2 spend: $0.

## Verdict

**Phase 2 done.** Live PWA ships the wedge (sort-by-tope + owned-wallet
filter + region-awareness) on top of the 40-row Phase 1 corpus. Ready for
user's week-1 trial per `product.md` success criteria.
