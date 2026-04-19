// MODO hub crawler — enumerates the live slug set from https://www.modo.com.ar/promos.
// Returns the slug list, a per-section classification (best-effort), and the main-content
// markdown hash for change-detection.
import { createHash } from 'node:crypto';
import { scrapePage } from '../lib/firecrawl.js';

export interface HubResult {
  slugs: string[];
  sections: Record<string, string[]>;
  raw_markdown_hash: string;
  markdown_length: number;
  credits_used: number | null;
}

const MODO_HUB_URL = 'https://www.modo.com.ar/promos';

// Every live detail URL matches /promos/<slug> where slug is [a-z0-9][a-z0-9-]+.
// We skip the root /promos itself and any /promos/slot/<...> category routes.
const SLUG_LINK_RE = /\/promos\/([a-z0-9][a-z0-9-]+)(?=[\s)"'#?]|$)/gi;
const RESERVED_SEGMENTS = new Set(['slot']);

// Exported for offline regression tests. Public surface of this module remains
// fetchModoHubSlugs; callers should not depend on this helper at runtime.
export function extractSlugsForTests(markdown: string): string[] {
  return extractSlugs(markdown);
}

function extractSlugs(markdown: string): string[] {
  const set = new Set<string>();
  for (const m of markdown.matchAll(SLUG_LINK_RE)) {
    const slug = m[1].toLowerCase();
    if (RESERVED_SEGMENTS.has(slug)) continue;
    // Filter obvious non-promo slugs (anchors like "main-content", root token).
    if (slug === 'main-content' || slug === 'promos') continue;
    set.add(slug);
  }
  return [...set].sort();
}

/**
 * Very loose section classifier. MODO's markdown has `## <section name>` headings before
 * each group of promo cards. We walk line-by-line, tracking the most recent heading, and
 * attribute each slug we encounter to that heading. When no heading has been seen yet we
 * drop the slug into the `_uncategorized` bucket — still counted in the flat `slugs` list.
 */
function classifyBySection(markdown: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentSection = '_uncategorized';
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      currentSection = heading[1].trim();
      continue;
    }
    for (const m of line.matchAll(SLUG_LINK_RE)) {
      const slug = m[1].toLowerCase();
      if (RESERVED_SEGMENTS.has(slug)) continue;
      if (slug === 'main-content' || slug === 'promos') continue;
      if (!sections[currentSection]) sections[currentSection] = [];
      if (!sections[currentSection].includes(slug)) sections[currentSection].push(slug);
    }
  }
  return sections;
}

export async function fetchModoHubSlugs(): Promise<HubResult> {
  const res = await scrapePage(MODO_HUB_URL, {
    waitFor: 5000,
    formats: ['markdown'],
    onlyMainContent: true,
  });

  const markdown = res.markdown ?? '';
  if (!markdown) {
    throw new Error('MODO hub returned empty markdown — Firecrawl JS render may have failed.');
  }

  const slugs = extractSlugs(markdown);
  const sections = classifyBySection(markdown);
  const raw_markdown_hash = createHash('sha256').update(markdown, 'utf8').digest('hex');

  return {
    slugs,
    sections,
    raw_markdown_hash,
    markdown_length: markdown.length,
    credits_used: res.creditsUsed,
  };
}
