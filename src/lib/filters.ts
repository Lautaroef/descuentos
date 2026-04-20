// Pure filter parsing — no DB, no server-only. Unit-testable in plain Node.
//
// The wedge differentiator is that these filters are SSR-applied, not JS-applied. This file
// is the contract: URL params → PromoFilter. `src/lib/queries.ts` only calls this and wraps
// the result in a SQL query.

import { isBankSlug, isCategorySlug, isWalletSlug } from './constants';
import type { Category, Wallet } from './schema';

export interface PromoFilter {
  wallets: Wallet[];
  categories: Category[];
  banks: string[];
  /** 0-6 weekday (0 = Sunday), or null = any day */
  day: number | null;
  /** ISO 3166-2:AR code or 'AR' for national. `null` = no region filter. */
  region: string | null;
  /**
   * User's planned spend in integer ARS. 0 = no spend context (default tope
   * sort). > 0 enables spend-aware effective-savings ranking.
   */
  spend: number;
}

/**
 * Parse a URLSearchParams-shaped input into a PromoFilter.
 * Tolerates comma-separated multi-select and drops unknown values silently.
 */
export function parseFilterFromParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): PromoFilter {
  const get = (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    const v = params[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const walletRaw = get('wallet') ?? get('banco') ?? '';
  const wallets = splitCsv(walletRaw).filter(isWalletSlug);

  const categoryRaw = get('rubro') ?? get('categoria') ?? '';
  const categories = splitCsv(categoryRaw).filter(isCategorySlug);

  const issuerRaw = get('issuer') ?? '';
  const banks = splitCsv(issuerRaw).filter(isBankSlug);

  const day = parseDayParam(get('dia'), now);
  const region = parseRegionParam(get('region'));
  const spend = parseSpendParam(get('spend'));

  return { wallets, categories, banks, day, region, spend };
}

/**
 * Parse the `?spend=30000` URL param into a non-negative integer ARS amount.
 * Returns 0 for any invalid / missing / non-numeric value (= no spend context).
 */
export function parseSpendParam(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Reject non-numeric input silently. Integer ARS only.
  if (!/^\d+$/.test(s)) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Cap at a sane ceiling to protect SQL from overflow / pathological inputs.
  // 100_000_000 ARS is ~USD 100k — far beyond any weekly supermarket budget.
  if (n > 100_000_000) return 100_000_000;
  return Math.floor(n);
}

export function parseDayParam(raw: string | null, now: Date = new Date()): number | null {
  if (!raw || raw === 'cualquiera' || raw === 'any') return null;
  if (raw === 'hoy') return now.getDay();
  if (raw === 'manana') return (now.getDay() + 1) % 7;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n;
  return null;
}

export function parseRegionParam(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (!/^[A-Za-z-]{2,10}$/.test(v)) return null;
  return v;
}

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Rebuild a URLSearchParams-friendly record from a PromoFilter, omitting empty values.
 * Used by the filter UI to produce "go to URL" links.
 */
export function filterToSearchParams(f: PromoFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.wallets.length) p.set('wallet', f.wallets.join(','));
  if (f.categories.length) p.set('rubro', f.categories.join(','));
  if (f.banks.length) p.set('issuer', f.banks.join(','));
  if (f.day !== null) p.set('dia', String(f.day));
  if (f.region) p.set('region', f.region);
  if (f.spend > 0) p.set('spend', String(f.spend));
  return p;
}
