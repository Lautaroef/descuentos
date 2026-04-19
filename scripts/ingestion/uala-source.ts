// Ualá Source adapter.
//
// `kind: 'per-url'` — hub (/promociones) enumerates merchant slugs, each
// /promociones/<slug> detail page yields exactly one Promo. Shape matches MODO.
import {
  UALA_SOURCE_ID,
  ualaSourceUrl,
  ualaPromoId,
  extractUalaPromo,
} from '../lib/uala-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';
import { fetchUalaHubSlugs } from './uala-hub.js';

export { UALA_SOURCE_ID, ualaSourceUrl, ualaPromoId };

export function createUalaSource(
  options: { slugOverride?: string; slugsOverride?: string[] } = {},
): Source {
  return {
    id: UALA_SOURCE_ID,
    kind: 'per-url',
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 6000,
    },

    async listUrls(): Promise<string[]> {
      if (options.slugOverride) return [ualaSourceUrl(options.slugOverride)];
      if (options.slugsOverride) return options.slugsOverride.map((s) => ualaSourceUrl(s));
      const hub = await fetchUalaHubSlugs();
      console.log(
        `[uala] hub returned ${hub.slugs.length} slug(s) (md=${hub.markdown_length} chars, credits=${hub.credits_used ?? 'n/a'})`,
      );
      return hub.slugs.map((s) => ualaSourceUrl(s));
    },

    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const slug = slugFromUrl(url);
      const result = await extractUalaPromo({ slug, markdown: scrape.markdown });
      return {
        promos: [result.promo],
        ids: [result.id],
        cost_usd: result.usage.cost_usd,
      };
    },
  };
}

function slugFromUrl(url: string): string {
  const m = url.match(/\/promociones\/([^/?#]+)/i);
  if (!m) throw new Error(`Ualá URL did not match /promociones/<slug>: ${url}`);
  return m[1].toLowerCase();
}
