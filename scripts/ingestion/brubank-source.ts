// Brubank Source adapter.
//
// `kind: 'bulk'` — one URL (https://brubank.com/beneficios) yields ~50 Promo rows
// via Gemini 2.5 Flash extraction. See docs/sources.md and
// scripts/lib/brubank-extract.ts for the full contract.
import {
  BRUBANK_SOURCE_ID,
  BRUBANK_SOURCE_URL,
  brubankPromoId,
  extractBrubankPromos,
} from '../lib/brubank-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';

export { BRUBANK_SOURCE_ID, BRUBANK_SOURCE_URL, brubankPromoId };

export function createBrubankSource(options: { urlOverride?: string } = {}): Source {
  const url = options.urlOverride ?? BRUBANK_SOURCE_URL;
  return {
    id: BRUBANK_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      // Webflow is statically rendered; markdown is enough.
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 5000,
    },

    async listUrls(): Promise<string[]> {
      return [url];
    },

    async extract(sourceUrl: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const result = await extractBrubankPromos({
        source_url: sourceUrl,
        markdown: scrape.markdown,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[brubank] ${result.rejected_count} promo(s) rejected by canonical Zod schema:\n  - ${result.rejected_reasons.join('\n  - ')}`,
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
