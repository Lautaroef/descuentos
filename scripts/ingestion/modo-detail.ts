// Per-slug MODO ingest: scrape detail, decide to skip-or-extract, upsert.
//
// The hash-compare skip logic saves ~$0.0013 Gemini + 0 scrape credits per unchanged slug
// once the slug is already in our DB. First-run every slug extracts.
import { scrapePage } from '../lib/firecrawl.js';
import {
  extractModoPromo,
  hashMarkdown,
  modoPromoId,
  modoSourceUrl,
} from '../lib/modo-extract.js';
import {
  listPromoSlugsForSource,
  markPromoSeen,
  upsertPromo,
  type PersistedPromoMeta,
} from '../lib/promo-repo.js';

export type IngestAction = 'inserted' | 'updated' | 'unchanged' | 'errored';

export interface IngestResult {
  slug: string;
  action: IngestAction;
  error?: string;
  cost_usd?: number;
  credits_used?: number | null;
  valid_days_from_rawhtml?: boolean;
  dates_from_vigencia?: boolean;
}

/**
 * Ingest one MODO slug. Caller (modo-run) supplies the previously-seen metadata index so
 * we can short-circuit unchanged slugs without a second DB round-trip.
 */
export async function ingestModoSlug(
  slug: string,
  existingByUrl: Map<string, PersistedPromoMeta>,
): Promise<IngestResult> {
  const source_url = modoSourceUrl(slug);

  let scraped;
  try {
    scraped = await scrapePage(source_url, {
      formats: ['markdown', 'rawHtml'],
      onlyMainContent: true,
      waitFor: 5000,
    });
  } catch (err: any) {
    return { slug, action: 'errored', error: `scrape: ${err?.message ?? String(err)}` };
  }

  const markdown = scraped.markdown ?? '';
  if (!markdown) {
    return { slug, action: 'errored', error: 'empty markdown from scrape' };
  }

  const hash = hashMarkdown(markdown);
  const existing = existingByUrl.get(source_url);

  if (existing && existing.raw_html_hash === hash) {
    await markPromoSeen('modo', source_url);
    return {
      slug,
      action: 'unchanged',
      credits_used: scraped.creditsUsed,
    };
  }

  let result;
  try {
    result = await extractModoPromo({ slug, markdown, rawHtml: scraped.rawHtml });
  } catch (err: any) {
    return { slug, action: 'errored', error: `extract: ${err?.message ?? String(err)}` };
  }

  try {
    const action = await upsertPromo({
      id: modoPromoId(slug),
      promo: result.promo,
      rawHtmlHash: hash,
    });
    return {
      slug,
      action,
      cost_usd: result.usage.cost_usd,
      credits_used: scraped.creditsUsed,
      valid_days_from_rawhtml: result.overrides.valid_days_from_rawhtml,
      dates_from_vigencia: result.overrides.dates_from_vigencia,
    };
  } catch (err: any) {
    return { slug, action: 'errored', error: `upsert: ${err?.message ?? String(err)}` };
  }
}

export async function loadExistingMetaIndex(): Promise<Map<string, PersistedPromoMeta>> {
  const rows = await listPromoSlugsForSource('modo');
  return new Map(rows.map((r) => [r.source_url, r]));
}
