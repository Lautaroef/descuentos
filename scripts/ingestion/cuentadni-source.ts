// Cuenta DNI Source adapter.
//
// `kind: 'bulk'` — one press article yields many Promos. See scripts/lib/source.ts
// for the interface contract and scripts/lib/source-runner.ts for how the runner
// handles bulk sources (hash-compare skip is DISABLED; always re-extracts).
import {
  CUENTADNI_SOURCE_ID,
  cuentaDniPromoId,
  extractCuentaDniPromos,
} from '../lib/cuentadni-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';
import { discoverLatestArticle } from './cuentadni-discovery.js';

export { CUENTADNI_SOURCE_ID, cuentaDniPromoId };

/**
 * Build the Cuenta DNI source adapter.
 *
 * Options:
 *   - `articleOverride`: bypass discovery and use an explicit article URL. Matches
 *     the `--article=<url>` CLI flag. Useful for debugging, for triangulation
 *     (force a specific Infobae URL), and for offline testing.
 */
export function createCuentaDniSource(options: { articleOverride?: string } = {}): Source {
  return {
    id: CUENTADNI_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      // Press articles don't need rawHtml (no data-testid markers); markdown is enough.
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 5000,
    },

    async listUrls(): Promise<string[]> {
      if (options.articleOverride) return [options.articleOverride];
      const article = await discoverLatestArticle();
      console.log(
        `[cuenta-dni] discovered article: "${article.title}" (${article.domain}, ${article.year}-${String(
          article.month,
        ).padStart(2, '0')})`,
      );
      return [article.url];
    },

    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const result = await extractCuentaDniPromos({
        source_url: url,
        markdown: scrape.markdown,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[cuenta-dni] ${result.rejected_count} promo(s) rejected by canonical Zod schema:\n  - ${result.rejected_reasons.join('\n  - ')}`,
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
