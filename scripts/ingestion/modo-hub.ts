// MODO hub crawler — enumerates the live slug set from https://www.modo.com.ar/promos.
// Returns the slug list, a per-section classification (best-effort), and the main-content
// markdown hash for change-detection.
//
// Resilience: MODO's hub is a Next.js SPA that hydrates client-side. Firecrawl must render
// JS (a plain fetch returns a 20KB script-only shell). Two failure modes we've observed:
//
//   1. Firecrawl's cache returns a stale 48-char SPA-title-only response because a prior
//      call landed during a hydration glitch and the bad response got cached. Every
//      subsequent call served from cache until the cache expired — which could be days.
//
//   2. Intermittent slow hydration: waitFor=5000 isn't always enough. We've seen MODO
//      sporadically need 10-12s. Firecrawl returns whatever was rendered at waitFor timeout.
//
// Fix: retry with escalation. First call uses a 1h cache and waitFor=5000 (fast path). If
// the response looks broken (markdown below the sanity-check floor) we retry with cache
// bypass + longer waitFor. If the escalated call ALSO looks broken we throw — which
// propagates to scrape_runs.error instead of silently returning 0 slugs.
//
// Any non-empty result with <10 slugs also raises — historical baseline is ~40-57.
import { createHash } from 'node:crypto';
import { scrapePage, type ScrapeOptions } from '../lib/firecrawl.js';

export interface HubResult {
  slugs: string[];
  sections: Record<string, string[]>;
  raw_markdown_hash: string;
  markdown_length: number;
  credits_used: number | null;
  /** Which attempt (1-based) produced the final result. 1 = fast path, 2 = escalation. */
  attempt: number;
}

const MODO_HUB_URL = 'https://www.modo.com.ar/promos';

// Every live detail URL matches /promos/<slug> where slug is [a-z0-9][a-z0-9-]+.
// We skip the root /promos itself and any /promos/slot/<...> category routes.
const SLUG_LINK_RE = /\/promos\/([a-z0-9][a-z0-9-]+)(?=[\s)"'#?]|$)/gi;
const RESERVED_SEGMENTS = new Set(['slot']);

// Sanity-check thresholds. These encode historical baselines so we fail loud on drift.
//
// `MIN_MARKDOWN_CHARS`: the 48-char SPA shell we've been getting comes in at exactly 48 chars.
// A healthy render is 14KB+. 500 chars is a conservative floor that catches both the shell
// and any other near-empty failure (e.g., redirect pages, error pages, partial renders).
//
// `MIN_SLUG_COUNT_SANITY`: historical hub sizes are 40 (April 19) to 57 (stress test). If we
// extract <10 slugs, something is meaningfully wrong — a DOM change, a partial render, or
// the slug regex no longer matching. We raise rather than silently proceed with a degraded
// slug list that would cause Phase 4 soft-purge to mark real promos stale.
const MIN_MARKDOWN_CHARS = 500;
const MIN_SLUG_COUNT_SANITY = 10;

// Scrape-options presets. The fast-path cache window is 1 hour — MODO publishes monthly,
// so an hourly cache is fine for daily cadence and lets a flaky run re-use a healthy cache.
// The escalation path bypasses the cache (`maxAge: 0`) and doubles the hydration budget.
const FAST_PATH: ScrapeOptions = {
  waitFor: 5000,
  formats: ['markdown'],
  onlyMainContent: true,
  maxAge: 3_600_000,
};
const ESCALATION_PATH: ScrapeOptions = {
  waitFor: 15000,
  formats: ['markdown'],
  onlyMainContent: true,
  maxAge: 0,
};

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

// Test-only seam: lets scripts/tests/modo-hub.test.ts swap the network call for a stub.
export interface FetchHubHooks {
  scrapeOverride?: (url: string, options: ScrapeOptions) => Promise<{
    markdown: string | null;
    creditsUsed: number | null;
  }>;
}

export async function fetchModoHubSlugs(hooks: FetchHubHooks = {}): Promise<HubResult> {
  const scrapeFn =
    hooks.scrapeOverride ??
    (async (url: string, options: ScrapeOptions) => {
      const r = await scrapePage(url, options);
      return { markdown: r.markdown, creditsUsed: r.creditsUsed };
    });

  // Attempt 1: fast path (cached, short wait). Succeeds on healthy runs.
  const first = await scrapeFn(MODO_HUB_URL, FAST_PATH);
  const firstMd = first.markdown ?? '';

  if (firstMd.length >= MIN_MARKDOWN_CHARS) {
    const result = buildResult(firstMd, first.creditsUsed, 1);
    assertSlugCountSane(result, 1, firstMd.length);
    return result;
  }

  // Fast path returned a suspiciously short body — cache may be serving stale trash,
  // or MODO hydration was slow this round. Escalate: bypass cache + longer wait.
  console.warn(
    `[modo-hub] fast path returned ${firstMd.length} chars (< ${MIN_MARKDOWN_CHARS}); escalating with maxAge=0 + waitFor=15000`,
  );
  const second = await scrapeFn(MODO_HUB_URL, ESCALATION_PATH);
  const secondMd = second.markdown ?? '';

  if (secondMd.length < MIN_MARKDOWN_CHARS) {
    throw new Error(
      `MODO hub scrape failed both attempts: attempt 1 returned ${firstMd.length} chars (fast path), ` +
        `attempt 2 returned ${secondMd.length} chars (maxAge=0, waitFor=15000). ` +
        `Likely causes: MODO added anti-bot, removed promo content, or Firecrawl JS rendering is failing. ` +
        `Visit ${MODO_HUB_URL} manually to confirm the page still renders for humans.`,
    );
  }

  // Credits charged on the escalated call are additive — caller reporting surfaces total.
  const combinedCredits =
    first.creditsUsed != null || second.creditsUsed != null
      ? (first.creditsUsed ?? 0) + (second.creditsUsed ?? 0)
      : null;
  const result = buildResult(secondMd, combinedCredits, 2);
  assertSlugCountSane(result, 2, secondMd.length);
  return result;
}

function buildResult(markdown: string, credits: number | null, attempt: number): HubResult {
  return {
    slugs: extractSlugs(markdown),
    sections: classifyBySection(markdown),
    raw_markdown_hash: createHash('sha256').update(markdown, 'utf8').digest('hex'),
    markdown_length: markdown.length,
    credits_used: credits,
    attempt,
  };
}

/**
 * Throw if the slug count is below the historical sanity floor.
 *
 * Silent-0 (or silent-3) was the class of bug we're eliminating. If the DOM changed or
 * MODO shrunk dramatically, we'd rather the run fail loudly than silently mark 40 real
 * promos as stale. The operator sees the error in scrape_runs and investigates.
 */
function assertSlugCountSane(result: HubResult, attempt: number, mdLength: number): void {
  if (result.slugs.length < MIN_SLUG_COUNT_SANITY) {
    throw new Error(
      `MODO hub sanity check failed: extracted ${result.slugs.length} slugs from ${mdLength}-char markdown ` +
        `on attempt ${attempt} (historical baseline is 40-57). The DOM may have changed or the slug ` +
        `regex is no longer matching. Re-check the scrape result and update the regex if needed.`,
    );
  }
}
