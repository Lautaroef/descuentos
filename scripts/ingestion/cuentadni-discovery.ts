// Cuenta DNI article discovery.
//
// Cuenta DNI promos are published in press-article monthly roundups (Ámbito, Infobae,
// iProfesional, iProUp). There is no single canonical URL — each month's article is
// a fresh URL. This module picks the most recent article.
//
// Firecrawl's `firecrawl_search` tool returns a list of URLs ranked by freshness.
// We favor Ámbito (its article structure has been the cleanest in our validation
// sweep — see docs/long-tail-sourcing.md) and fall back to the other outlets.
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env.local') });
loadEnv({ path: resolve(__dirname, '..', '..', '.env'), override: false });

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';

export const SEARCH_QUERY =
  '"Cuenta DNI" beneficios site:ambito.com OR site:iprofesional.com OR site:iproup.com OR site:infobae.com';

// Outlet preference order. Ámbito first (cleanest structure per validation sweep),
// then Infobae (used for triangulation), then Ámbito's AR sister site, then the rest.
const OUTLET_PRIORITY = ['ambito.com', 'infobae.com', 'iproup.com', 'iprofesional.com'];

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface DiscoveryCandidate {
  url: string;
  title: string;
  domain: string;
  /** Matched month (1-12) if we could parse it from the title. */
  month: number | null;
  /** Matched year (four digits) if we could parse it from the title. */
  year: number | null;
}

export interface SearchResultsProvider {
  search(query: string, limit?: number): Promise<Array<{ url: string; title: string }>>;
}

/**
 * Default provider: calls Firecrawl's `/v1/search` REST API.
 */
class FirecrawlSearchProvider implements SearchResultsProvider {
  async search(query: string, limit = 10): Promise<Array<{ url: string; title: string }>> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error(
        'FIRECRAWL_API_KEY is not set. Populate .env.local before running article discovery.',
      );
    }

    const res = await fetch(`${FIRECRAWL_BASE}/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(`Firecrawl search ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<{ url?: string; title?: string }>;
    };

    const hits = json.data ?? [];
    return hits
      .filter((h): h is { url: string; title: string } => typeof h.url === 'string' && typeof h.title === 'string')
      .map((h) => ({ url: h.url, title: h.title }));
  }
}

function parseDomain(url: string): string {
  try {
    const u = new URL(url);
    // Strip "www."
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseMonthYear(title: string): { month: number | null; year: number | null } {
  const lower = title.toLowerCase();
  let month: number | null = null;
  for (let i = 0; i < MONTH_NAMES.length; i += 1) {
    const name = MONTH_NAMES[i];
    if (lower.includes(name)) {
      month = i + 1;
      break;
    }
  }
  const yearMatch = lower.match(/20\d{2}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  return { month, year };
}

/**
 * Given a list of raw search hits, score and pick the best article URL.
 *
 * Ranking:
 *   1. Filter out results that don't mention a month+year in the title.
 *   2. Sort by (year, month) descending — most recent wins.
 *   3. Tie-break by outlet priority (Ámbito before Infobae before the rest).
 *
 * Exported for offline testing.
 */
export function pickArticle(
  hits: Array<{ url: string; title: string }>,
  /**
   * Optional "today" clock; defaults to the real current date. Used in tests to
   * check the ranker handles "this month's article" semantics correctly.
   */
  today: Date = new Date(),
): DiscoveryCandidate | null {
  const candidates: DiscoveryCandidate[] = hits.map((h) => {
    const { month, year } = parseMonthYear(h.title);
    return {
      url: h.url,
      title: h.title,
      domain: parseDomain(h.url),
      month,
      year,
    };
  });

  // Filter: keep only candidates with a parsable month+year. We need that signal
  // to pick "most recent". (Hits missing month/year are typically landing pages.)
  const parsed = candidates.filter((c) => c.month !== null && c.year !== null);
  if (parsed.length === 0) return null;

  // Exclude articles from the future relative to `today`. Press outlets sometimes
  // publish a preview for next month; we want the current or most recent past month.
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1;
  const notFuture = parsed.filter(
    (c) => (c.year as number) < todayYear || ((c.year as number) === todayYear && (c.month as number) <= todayMonth),
  );

  const pool = notFuture.length > 0 ? notFuture : parsed;

  pool.sort((a, b) => {
    const ay = a.year as number;
    const by = b.year as number;
    if (ay !== by) return by - ay;
    const am = a.month as number;
    const bm = b.month as number;
    if (am !== bm) return bm - am;
    // Outlet tie-break.
    const ao = OUTLET_PRIORITY.findIndex((d) => a.domain.endsWith(d));
    const bo = OUTLET_PRIORITY.findIndex((d) => b.domain.endsWith(d));
    // Domains we don't know about go to the bottom.
    const aRank = ao === -1 ? OUTLET_PRIORITY.length : ao;
    const bRank = bo === -1 ? OUTLET_PRIORITY.length : bo;
    return aRank - bRank;
  });

  return pool[0];
}

/**
 * Live article discovery. Pulls from Firecrawl search and picks the top candidate.
 * Pass a custom provider for offline tests.
 */
export async function discoverLatestArticle(
  provider: SearchResultsProvider = new FirecrawlSearchProvider(),
): Promise<DiscoveryCandidate> {
  const hits = await provider.search(SEARCH_QUERY, 10);
  if (hits.length === 0) {
    throw new Error('Article discovery failed: search returned 0 hits.');
  }
  const pick = pickArticle(hits);
  if (!pick) {
    throw new Error(
      `Article discovery failed: no search hit had a parsable month+year in its title. Hits: ${JSON.stringify(hits.slice(0, 5))}`,
    );
  }
  return pick;
}
