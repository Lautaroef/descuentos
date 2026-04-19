// MODO Source adapter.
//
// Conforms to the `Source` interface in scripts/lib/source.ts. Delegates URL listing
// to the existing hub crawler (`modo-hub.ts`) and extraction to the existing MODO
// pipeline (`scripts/lib/modo-extract.ts`). This file is a thin bridge — behaviour
// must match the Phase 1 ingest exactly. See docs/phase-1-notes.md for the contract.
import {
  extractModoPromo,
  modoPromoId,
  modoSourceUrl,
} from '../lib/modo-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';
import { fetchModoHubSlugs } from './modo-hub.js';

export const MODO_SOURCE_ID = 'modo';

/**
 * Build the MODO source adapter.
 *
 * Optional `slugOverride`: used by the `--slug=<slug>` CLI path and by tests. When
 * provided, `listUrls()` returns just that one slug without hitting the hub.
 */
export function createModoSource(options: { slugOverride?: string } = {}): Source {
  return {
    id: MODO_SOURCE_ID,
    kind: 'per-url',
    scrapeOptions: {
      formats: ['markdown', 'rawHtml'],
      onlyMainContent: true,
      waitFor: 5000,
    },

    async listUrls(): Promise<string[]> {
      if (options.slugOverride) {
        return [modoSourceUrl(options.slugOverride)];
      }
      const hub = await fetchModoHubSlugs();
      return hub.slugs.map((s) => modoSourceUrl(s));
    },

    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const slug = slugFromUrl(url);
      const result = await extractModoPromo({
        slug,
        markdown: scrape.markdown,
        rawHtml: scrape.rawHtml,
      });
      return {
        promos: [result.promo],
        ids: [modoPromoId(slug)],
        overrides: [
          {
            valid_days_from_rawhtml: result.overrides.valid_days_from_rawhtml,
            dates_from_vigencia: result.overrides.dates_from_vigencia,
          },
        ],
        cost_usd: result.usage.cost_usd,
      };
    },
  };
}

function slugFromUrl(url: string): string {
  // URLs are always https://www.modo.com.ar/promos/<slug>. Robust against a
  // trailing query / hash and accidentally-uppercased slugs.
  const m = url.match(/\/promos\/([^/?#]+)/i);
  if (!m) throw new Error(`MODO URL did not match /promos/<slug>: ${url}`);
  return m[1].toLowerCase();
}
