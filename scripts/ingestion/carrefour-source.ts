// Carrefour Source adapter.
//
// `kind: 'bulk'`, single URL (/descuentos-bancarios).
//
// VTEX BP dataentity investigation: the catalog IS backed by a VTEX dataentity
// called `BP` (confirmed via image URLs of shape
// `/api/dataentities/BP/documents/{uuid}/img_card_N/attachments/<wallet>.png`).
// We probed the public search endpoint with every plausible field name (id,
// name, title, description, bank, percent, tope, image, logo, label, etc.) —
// all content fields return 403 "Cannot read private fields". Only `id` is
// publicly readable. See docs/sources/carrefour.md for the full probe
// transcript and suggested follow-ups if Carrefour ever opens it up.
//
// HTML fallback it is. 1 Firecrawl credit per refresh, LLM-extract via Gemini.
import {
  CARREFOUR_SOURCE_ID,
  extractCarrefourPromos,
  carrefourPromoId,
} from '../lib/carrefour-extract.js';
import type { Source, ExtractOutput, ScrapeInput } from '../lib/source.js';

export { CARREFOUR_SOURCE_ID, carrefourPromoId };

export const CARREFOUR_DEFAULT_URL =
  'https://www.carrefour.com.ar/descuentos-bancarios';

export interface CarrefourSourceOptions {
  urlOverride?: string;
}

export function createCarrefourSource(options: CarrefourSourceOptions = {}): Source {
  return {
    id: CARREFOUR_SOURCE_ID,
    kind: 'bulk',
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 5000,
    },

    async listUrls(): Promise<string[]> {
      return [options.urlOverride ?? CARREFOUR_DEFAULT_URL];
    },

    async extract(url: string, scrape: ScrapeInput): Promise<ExtractOutput> {
      const cleaned = cleanCarrefourMarkdown(scrape.markdown);

      const result = await extractCarrefourPromos({
        source_url: url,
        markdown: cleaned,
      });
      if (result.rejected_count > 0) {
        console.warn(
          `[carrefour] ${result.rejected_count} promo(s) rejected by canonical Zod schema:\n  - ${result.rejected_reasons.join('\n  - ')}`,
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

/**
 * Carrefour's storefront injects a gigantic embedded-JS/CSS blob (VTEX render
 * runtime strings, dynamicTabsBreadcrumb hydration code) into a single markdown
 * line in excess of 50k chars. It adds thousands of tokens to the Gemini prompt
 * for no signal — the promo content flows cleanly in the rest of the page.
 *
 * Drop any line > 5000 chars (threshold picked from the observed 68k-char blob;
 * no promo description legitimately exceeds a few hundred chars). Also collapse
 * runs of 3+ blank lines. Pure string-level hygiene; if an adapter needs the
 * full raw markdown it can bypass this (the source's `scrape.markdown` is
 * untouched upstream of this function).
 */
export function cleanCarrefourMarkdown(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const kept = lines.filter((l) => l.length < 5000);
  const out = kept.join('\n');
  return out.replace(/\n{3,}/g, '\n\n');
}

export const carrefourSource = createCarrefourSource();
