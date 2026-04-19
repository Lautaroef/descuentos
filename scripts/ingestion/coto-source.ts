// Coto Source adapter.
//
// `kind: 'bulk'` — one URL yields many Promos (same as Cuenta DNI). We scrape
// TWO URLs by default (coto.com.ar/descuentos/ + cotodigital.com.ar/sitios/cdigi/descuentos)
// because each surfaces overlapping-but-not-identical promos:
//   - coto.com.ar/descuentos/ is the physical-store catalog (day-tabbed UI)
//   - cotodigital.com.ar/sitios/cdigi/descuentos is the e-commerce catalog
//     (list-all-days layout)
//
// Intra-source dedup is handled inside the extractor (`supermarketPromoId`
// dedupes on the content tuple per-URL). Cross-URL dedup across the two Coto
// endpoints is NOT attempted here — we WANT both URLs to carry their own rows
// even if the promos overlap, since each URL represents a distinct surface the
// user might land on. Phase 4 canonical dedup will collapse equivalents.
import {
  COTO_SOURCE_ID,
  extractCotoPromos,
  cotoPromoId,
} from '../lib/coto-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';

export { COTO_SOURCE_ID, cotoPromoId };

export const COTO_DEFAULT_URLS = [
  'https://www.coto.com.ar/descuentos/',
  'https://www.cotodigital.com.ar/sitios/cdigi/descuentos',
] as const;

export interface CotoSourceOptions {
  /** Override the default URL list (e.g., for single-URL smoke tests). */
  urlOverride?: string[];
}

export function createCotoSource(options: CotoSourceOptions = {}): Source {
  return {
    id: COTO_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      // Coto surfaces hydrate via JS — waitFor 5s is required for the
      // cotodigital.com.ar page to render its full catalog.
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 5000,
    },

    async listUrls(): Promise<string[]> {
      return options.urlOverride && options.urlOverride.length > 0
        ? options.urlOverride
        : [...COTO_DEFAULT_URLS];
    },

    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const result = await extractCotoPromos({
        source_url: url,
        markdown: scrape.markdown,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[coto] ${result.rejected_count} promo(s) rejected by canonical Zod schema:\n  - ${result.rejected_reasons.join('\n  - ')}`,
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

export const cotoSource = createCotoSource();
