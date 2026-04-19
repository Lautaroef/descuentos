# Project Docs

Read in this order if you're new to the project:

1. [product.md](product.md) — What we're building and why. The user problem, the wedge, what's in and out of scope.
2. [data-sources.md](data-sources.md) — **The most important doc.** Where Argentine promo data actually lives (April 2026), which sources are primary vs supplementary vs manual, and the critical gotchas. Rewritten after the PoC; treat as authoritative.
3. [data-validation-poc.md](data-validation-poc.md) — Empirical PoC that validated each source against the canonical `Promo` schema. Scripts in `scripts/validate-*.ts`, raw artifacts in `scripts/samples/`. Read for the evidence trail behind `data-sources.md`.
4. [modo-stress-test.md](modo-stress-test.md) — **Phase 2 stress-test (April 2026).** Catalog enumeration at scale (57 live slugs, 4,492 in sitemap), 10-page extraction sweep (10/10 schema-valid), credit-cost measurement, slug-diff validation via Wayback CDX, rawHtml `data-testid` breakthrough for deterministic `valid_days`. Final production extraction prompt included.
5. [architecture.md](architecture.md) — Stack decision, core patterns (upsert-with-TTL, per-source SLO table, LLM extraction with Zod), and cost envelope.
6. [context.md](context.md) — Prior art worth forking, legal posture, Argentine dev community.
7. [competitor-promoarg.md](competitor-promoarg.md) — Reverse-engineering of PromoArg. Their "55k promos" is denormalized; they have no moat. What to copy, where to beat them.
8. [long-tail-sourcing.md](long-tail-sourcing.md) — Phase 2 validation. Press-article LLM extraction for Cuenta DNI (9/9 promos first try), open web catalogs for Brubank/Naranja X/Ualá/Personal Pay, supermarket-native cross-wallet catalogs (Coto `/descuentos`, Jumbo `/descuentos-del-dia`, Carrefour `/descuentos-bancarios`). Tier 3 collapses; coverage jumps to ~85-90% of AR deal-hunter's promo universe.
9. [build-plan.md](build-plan.md) — **The work contract.** Phased build plan from Phase 0 (bootstrap) through Phase 6 (optional public launch). Each phase has goal, deliverables, exit criteria, effort estimate, risks. Personal-use ship by end of Phase 2; differentiator parity+ by end of Phase 4.
10. [firecrawl-alternative-analysis.md](firecrawl-alternative-analysis.md) — **Stack-cost review (April 2026).** Evaluates replacing Firecrawl with self-hosted Playwright / ScrapFly / direct LLM calls. Empirically validated: keep Firecrawl `/scrape` (commodity-priced), replace `firecrawl_extract` (~28 credit markup) with direct Gemini 2.5 Flash calls. Measured steady-state cost **~$16.52/mo** vs. $83/mo status quo (5.0x cheaper), 10/10 schema-valid on the MODO stress corpus. Benchmark: `scripts/samples/llm-comparison/gemini-benchmark-summary.md`.
11. [phase-1-notes.md](phase-1-notes.md) — **Phase 1 shipped (April 2026).** MODO ingestion end-to-end: hub crawler → slug-diff → Hybrid B extract (Firecrawl scrape + direct Gemini 2.5 Flash) → upsert-with-TTL. File list, first live-run numbers, gotchas, deferrals, and pointers for extending to Cuenta DNI / Brubank / Naranja X (Phase 3).
12. [phase-2-notes.md](phase-2-notes.md) — **Phase 2 shipped (April 2026).** Next.js 15 PWA on top of the Phase 1 ingest. SSR-true filters, sort-by-tope, owned-wallet onboarding, SEO landings for 24 banks × 8 categories, Serwist service worker, live on Vercel. File list, deploy URL, UX decisions, and a week-1 testing checklist.
13. [testing.md](testing.md) — Test runners and where each kind of test lives (node:test, Vitest, Playwright). Smoke tests included as scaffolding.
14. [sources.md](sources.md) — **The source-adapter playbook.** How to add a new ingestion source: `Source` interface, deterministic ids, test scaffolding, DB seed. Phase 3.0+.
15. [backlog.md](backlog.md) — Validated demand signals worth revisiting (gastronomía scope, cuotas-as-inflation-hedge ranking, etc.). Source-cited; not a commitment — a memory aid.

## Conventions

- All URLs and endpoints were verified live in April 2026. **Re-verify before relying on any of them** — the whole premise of the AR promo landscape is that it changes constantly.
- When a doc goes stale, update it in place or delete it. Do not stack `notes-v2.md` / `notes-final.md` files.
- Keep docs agent-facing: an agent landing cold in this repo should be able to start working after reading these files in order.
