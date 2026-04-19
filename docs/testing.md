# Testing

Three runners, three layers. Follow this convention when adding tests.

## Layers

| Runner | Location | What lives here |
|---|---|---|
| `node:test` | `scripts/tests/*.test.ts`, `src/lib/queries.test.ts` | Ingestion-side unit tests (scripts/ world) and the legacy filter-parsing suite. Fast, no DOM, pure TS. |
| Vitest | `src/**/*.{test,spec}.{ts,tsx}` | UI unit + React component tests. Runs on `happy-dom` via `@testing-library/react`. Supports the `@/*` path alias. |
| Playwright | `tests/e2e/*.spec.ts` | End-to-end browser tests. Spins up `pnpm dev` on port 3000 (or reuses an existing server) and drives Chromium. |

## Commands

| Command | What it runs |
|---|---|
| `pnpm test` | node:test (scripts + legacy src filter tests) |
| `pnpm test:unit` | Vitest — one-shot |
| `pnpm test:unit:watch` | Vitest — dev loop |
| `pnpm test:e2e` | Playwright — needs `.env.local` for DB-backed pages |
| `pnpm test:all` | All three in sequence |

## Configs

- `vitest.config.ts` — React plugin, happy-dom, `@/*` alias, `test/setup.ts` registers `@testing-library/jest-dom` matchers.
- `playwright.config.ts` — one `chromium` project, `baseURL: http://localhost:3000`, `webServer` reuses an existing dev server locally, retries twice on CI.
- `src/lib/queries.test.ts` is excluded from Vitest because it imports from `node:test`; leave it there until a deliberate migration.

## Smoke tests as examples

- `src/components/PromoCard.smoke.test.tsx` — Vitest + Testing Library + fixture pattern.
- `tests/e2e/smoke.spec.ts` — minimal Playwright navigation.

Copy these as scaffolding when you add new tests.
