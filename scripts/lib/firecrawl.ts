// Thin HTTP client around Firecrawl's /v1/scrape endpoint.
// We use /scrape (commodity-priced) per docs/firecrawl-alternative-analysis.md.
// Extraction is NOT done here — Gemini handles that (see lib/gemini.ts).
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '..', '.env.local') });
loadEnv({ path: resolve(__dirname, '..', '..', '.env'), override: false });

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    throw new Error(
      'FIRECRAWL_API_KEY is not set. Populate .env.local (see .env.example) before running scrape jobs.',
    );
  }
  return key;
}

export interface ScrapeOptions {
  waitFor?: number;
  formats?: Array<'markdown' | 'rawHtml' | 'html' | 'links' | 'screenshot'>;
  onlyMainContent?: boolean;
  /** Soft request timeout in ms; applies to the HTTP call, not to Firecrawl's internal waitFor. */
  timeoutMs?: number;
  /**
   * Firecrawl cache max-age in milliseconds. When set, Firecrawl may return a cached
   * response that is younger than this. Pass `0` to force a fresh scrape (bypasses cache).
   * Unset = Firecrawl default (which has burned us before — a transient bad response gets
   * stuck in the cache). Prefer setting an explicit value (e.g. `3_600_000` for 1 hour
   * hub crawls) so cache behaviour is deterministic.
   */
  maxAge?: number;
}

export interface ScrapeResult {
  markdown: string | null;
  rawHtml: string | null;
  metadata: Record<string, unknown>;
  creditsUsed: number | null;
  /** Credits reported by the server for this request. May be null on older tiers. */
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  error?: string;
  data?: {
    markdown?: string;
    rawHtml?: string;
    html?: string;
    metadata?: Record<string, unknown>;
  };
  /** Some Firecrawl tiers expose credit cost under different shapes. */
  creditsUsed?: number;
}

/**
 * Scrape a single URL via Firecrawl `/v1/scrape`.
 *
 * Defaults: `formats=['markdown','rawHtml']`, `onlyMainContent=true`, `waitFor=5000`.
 * Retries 429 and 5xx up to 3 times with exponential backoff.
 * Surfaces any other 4xx as a thrown error.
 */
export async function scrapePage(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const {
    waitFor = 5000,
    formats = ['markdown', 'rawHtml'],
    onlyMainContent = true,
    timeoutMs = 90_000,
    maxAge,
  } = options;

  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    url,
    formats,
    onlyMainContent,
    waitFor,
  };
  if (typeof maxAge === 'number') {
    body.maxAge = maxAge;
  }

  const maxRetries = 3;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429 || res.status >= 500) {
        const backoffMs = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        lastError = new Error(`Firecrawl ${res.status} for ${url} — retrying in ${backoffMs}ms`);
        console.warn(`[firecrawl] ${res.status} on ${url} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`);
        if (attempt === maxRetries) break;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '<no body>');
        throw new Error(`Firecrawl ${res.status} for ${url}: ${text.slice(0, 500)}`);
      }

      const json = (await res.json()) as FirecrawlScrapeResponse;
      if (json.success === false) {
        throw new Error(`Firecrawl returned success=false for ${url}: ${json.error ?? '<no error>'}`);
      }

      const data = json.data ?? {};
      const markdown = typeof data.markdown === 'string' ? data.markdown : null;
      const rawHtml = typeof data.rawHtml === 'string' ? data.rawHtml : null;

      if (formats.includes('markdown') && markdown === null) {
        console.warn(`[firecrawl] expected markdown but got none for ${url}`);
      }
      if (formats.includes('rawHtml') && rawHtml === null) {
        console.warn(`[firecrawl] expected rawHtml but got none for ${url}`);
      }

      return {
        markdown,
        rawHtml,
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
        creditsUsed: typeof json.creditsUsed === 'number' ? json.creditsUsed : null,
      };
    } catch (err: any) {
      // Abort / network-level errors: retry the same way we retry 5xx.
      if (err?.name === 'AbortError' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
        const backoffMs = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        lastError = err;
        console.warn(`[firecrawl] network error on ${url} (attempt ${attempt + 1}): ${err?.message ?? err}; retrying in ${backoffMs}ms`);
        if (attempt === maxRetries) break;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      // Non-retryable: rethrow with URL context.
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Firecrawl failed for ${url} after ${maxRetries + 1} attempts`);
}
