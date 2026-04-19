// Source abstraction — shared contract for ingestion adapters.
//
// We have exactly two real shapes in Phase 3:
//
//   1. `per-url`  — hub + detail pages. Each URL yields exactly one canonical Promo.
//                   MODO is the exemplar: hub → slug list → one extract per slug.
//
//   2. `bulk`     — one source URL (usually a press article) yields MANY Promos. The
//                   Cuenta DNI extractor parses one Ámbito/Infobae roundup article
//                   into 9+ promo rows that all share the same `source_url`.
//
// The runner (`source-runner.ts`) consumes this interface generically: it calls
// `listUrls()`, scrapes each one, invokes `extract(...)` for the Promo[] output,
// and persists every row with the upsert-with-TTL pattern.
//
// Keep this interface small. Speculative generality (concurrency knobs, retry
// policies, per-source config schemas) belongs in specific adapters, not here —
// see the YAGNI note in docs/phase-1-notes.md §"Notes for the next agent".
import type { Promo } from '../promo-schema.js';

export interface ScrapeInput {
  /** Markdown returned by Firecrawl — the LLM's input. */
  markdown: string;
  /** Raw HTML if the adapter requested it (MODO uses this for `data-testid` regex). */
  rawHtml: string | null;
}

export interface ExtractOutput {
  /** One or more canonical Promos extracted from this URL. */
  promos: Promo[];
  /**
   * Stable UUID v5 per promo. MUST be deterministic so repeated runs produce stable
   * upserts (the `(source_id, source_url)` unique key handles DB identity; this id is
   * the row's primary key and is preserved across upserts).
   *
   * For `per-url` adapters: typically one id derived from the URL.
   * For `bulk` adapters: must be unique per promo, typically derived from
   *   (source_url, merchant, pct) or similar content tuple.
   */
  ids: string[];
  /** Optional per-promo metadata flags the runner will surface in its rollup. */
  overrides?: Array<Record<string, boolean>>;
  /** Gemini cost in USD (summed across any LLM calls for this URL). */
  cost_usd?: number;
}

export interface Source {
  /** Canonical source id — matches `sources.id` in the DB. */
  id: string;

  /**
   * `per-url`: one Promo per URL. Hash-compare skip works cleanly because content
   *   hash ↔ one canonical row.
   *
   * `bulk`: one URL yields N Promos. Hash-compare skip is intentionally disabled for
   *   bulk sources in the runner — see source-runner.ts for the rationale. Policy:
   *   always extract; if the article body hasn't changed, upserts are idempotent by
   *   design.
   */
  kind: 'per-url' | 'bulk';

  /** Firecrawl scrape options for this source (formats, waitFor, onlyMainContent). */
  scrapeOptions?: {
    formats?: Array<'markdown' | 'rawHtml'>;
    waitFor?: number;
    onlyMainContent?: boolean;
  };

  /** Fetch the list of URLs to scrape. For `bulk`, typically returns 1 URL. */
  listUrls(): Promise<string[]>;

  /** Extract Promo[] from a single scraped URL. */
  extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput>;
}
