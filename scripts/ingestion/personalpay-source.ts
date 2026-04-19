// Personal Pay Source adapter. `kind: 'bulk'` — one hub URL → many Promos.
// Topes are intentionally null (see lib/personalpay-extract.ts header).
import {
  PERSONALPAY_SOURCE_ID,
  PERSONALPAY_SOURCE_URL,
  personalpayPromoId,
  extractPersonalPayPromos,
} from '../lib/personalpay-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';

export { PERSONALPAY_SOURCE_ID, PERSONALPAY_SOURCE_URL, personalpayPromoId };

export function createPersonalPaySource(
  options: { urlOverride?: string } = {},
): Source {
  const url = options.urlOverride ?? PERSONALPAY_SOURCE_URL;
  return {
    id: PERSONALPAY_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      // AEM-rendered grid; needs the longer wait for pagination controls.
      waitFor: 6000,
    },

    async listUrls(): Promise<string[]> {
      return [url];
    },

    async extract(sourceUrl: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const result = await extractPersonalPayPromos({
        source_url: sourceUrl,
        markdown: scrape.markdown,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[personalpay] ${result.rejected_count} promo(s) rejected:\n  - ${result.rejected_reasons.join('\n  - ')}`,
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
