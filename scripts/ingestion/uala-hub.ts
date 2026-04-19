// Ualá hub crawler.
//
// The hub at https://www.uala.com.ar/promociones is a Next.js page. Merchant
// detail pages live at /promociones/<slug>. The hub markdown contains links of
// the form `(https://www.uala.com.ar/promociones/<slug>)` — we parse those.
//
// Matches the shape of scripts/ingestion/modo-hub.ts but simpler: no sitemap,
// no category subpages, no pagination — the hub's markdown is the complete list.
import { scrapePage } from '../lib/firecrawl.js';

const HUB_URL = 'https://www.uala.com.ar/promociones';

// Slugs we MUST ignore because they're navigation/auxiliary, not promo details.
// (Observed on the live hub: `uala-mas`, various banners.)
const IGNORED_SLUGS = new Set<string>([
  'uala-mas',
]);

export interface UalaHubResult {
  slugs: string[];
  raw_markdown_hash: string;
  markdown_length: number;
  credits_used: number | null;
}

export function parseHubSlugs(markdown: string): string[] {
  // Look for links of the form `(https://www.uala.com.ar/promociones/<slug>)`.
  // Slug is the trailing path segment before a query/hash or closing paren.
  const re = /https?:\/\/(?:www\.)?uala\.com\.ar\/promociones\/([a-z0-9][a-z0-9-]*)/gi;
  const seen = new Set<string>();
  for (const m of markdown.matchAll(re)) {
    const slug = m[1].toLowerCase();
    if (IGNORED_SLUGS.has(slug)) continue;
    seen.add(slug);
  }
  return [...seen].sort();
}

export async function fetchUalaHubSlugs(): Promise<UalaHubResult> {
  const r = await scrapePage(HUB_URL, {
    formats: ['markdown'],
    onlyMainContent: true,
    waitFor: 6000,
  });
  const markdown = r.markdown ?? '';
  const slugs = parseHubSlugs(markdown);
  // Crude SHA-256-like marker for audit (mirrors MODO's convention).
  const { createHash } = await import('node:crypto');
  const raw_markdown_hash = createHash('sha256').update(markdown, 'utf8').digest('hex');
  return {
    slugs,
    raw_markdown_hash,
    markdown_length: markdown.length,
    credits_used: r.creditsUsed,
  };
}
