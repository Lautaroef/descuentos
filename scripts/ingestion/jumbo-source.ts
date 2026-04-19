// Jumbo Source adapter.
//
// `kind: 'bulk'`. Two URLs by default:
//   1. /descuentos-del-dia   — cross-bank catalog
//   2. /jumbo-al-cien         — pesoscheck cupon program (own-cupon)
//
// The /descuentos-del-dia URL accepts a `?type=por-dia&day=N` query param that
// filters by weekday; the default scrape pulls today's day. In Phase 3.3 we
// don't loop over all 7 days — Firecrawl returns the "Todos los días" promos
// every time regardless of the day filter, and per-day bank promos still show
// up for the requested day. This is explicitly a known gap (documented in
// docs/sources/jumbo.md) that Phase 4 can address by looping day=0..6 if we
// find missing promos.
//
// Jumbo al 100 rotates monthly (emission/canje dates change) but the URL path
// stays stable. Re-running the ingest picks up the new cycle's dates; the
// deterministic id does not include dates so the row UPDATEs in place.
import {
  JUMBO_SOURCE_ID,
  extractJumboPromos,
  jumboPromoId,
} from '../lib/jumbo-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';

export { JUMBO_SOURCE_ID, jumboPromoId };

export const JUMBO_DEFAULT_URLS = [
  'https://www.jumbo.com.ar/descuentos-del-dia',
  'https://www.jumbo.com.ar/jumbo-al-cien',
] as const;

export interface JumboSourceOptions {
  urlOverride?: string[];
}

export function createJumboSource(options: JumboSourceOptions = {}): Source {
  return {
    id: JUMBO_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      // Jumbo is a VTEX SPA — 5s wait is required for the catalog to hydrate.
      waitFor: 5000,
    },

    async listUrls(): Promise<string[]> {
      return options.urlOverride && options.urlOverride.length > 0
        ? options.urlOverride
        : [...JUMBO_DEFAULT_URLS];
    },

    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const result = await extractJumboPromos({
        source_url: url,
        markdown: scrape.markdown,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[jumbo] ${result.rejected_count} promo(s) rejected by canonical Zod schema:\n  - ${result.rejected_reasons.join('\n  - ')}`,
        );
      }
      return {
        promos: result.promos,
        ids: result.ids,
        cost_usd: result.usage.cost_usd,
      };
    },
  };
}

export const jumboSource = createJumboSource();
