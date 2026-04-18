# MODO Stress-Test — Raw Artifacts

Phase 2 evidence (April 2026). Scraped 10 MODO detail pages covering edge cases,
ran LLM extraction, measured credit cost, validated against canonical Promo schema.

## Files

- **modo-slug-catalog.json** (`../modo-slug-catalog.json`) — Full live + sitemap slug catalog.
- **extraction-sweep.json** — Per-page scrape + extract results, pass/fail per field, human spot-checks.
- **slug-diff-evidence.json** — Same-day churn + Wayback CDX 30-90d comparison.
- **operational-findings.json** — Firecrawl pricing, anti-bot posture, breakthrough on rawHtml `data-testid`.

## Per-slug artifacts

Each slug has markdown + extract JSON saved when non-trivial. To re-run any extraction:
use `mcp__firecrawl__firecrawl_extract` on the URL with the v2 prompt in
`extraction-sweep.json.prompt_variants_tested.v2_reasoning_required`.

## Key findings

See `../../docs/modo-stress-test.md` for the synthesized verdict and actions.
