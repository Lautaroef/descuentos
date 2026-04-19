// Naranja X Source adapter.
//
// `kind: 'bulk'` — each hub URL yields many Promo rows (the runner handles each
// URL independently, re-extracting on every run since hash-compare skip is
// disabled for bulk sources). Deterministic UUID v5 per promo makes upserts
// idempotent even when the same promo appears on multiple hubs under different
// source_urls.
import {
  NARANJAX_SOURCE_ID,
  NARANJAX_HUB_URLS,
  naranjaxPromoId,
  extractNaranjaxPromos,
} from '../lib/naranjax-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';

export { NARANJAX_SOURCE_ID, NARANJAX_HUB_URLS, naranjaxPromoId };

export function createNaranjaxSource(
  options: { urlsOverride?: string[] } = {},
): Source {
  const urls = options.urlsOverride ?? NARANJAX_HUB_URLS;
  return {
    id: NARANJAX_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      // Naranja X hub is client-rendered; needs a longer wait (per long-tail-sourcing.md).
      waitFor: 6000,
    },

    async listUrls(): Promise<string[]> {
      return urls;
    },

    async extract(sourceUrl: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const result = await extractNaranjaxPromos({
        source_url: sourceUrl,
        markdown: scrape.markdown,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[naranjax] ${result.rejected_count} promo(s) rejected at ${sourceUrl}:\n  - ${result.rejected_reasons.join('\n  - ')}`,
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
