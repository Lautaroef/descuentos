// The sitemap is prerendered during `next build`. A DB outage must not fail the
// deploy (regression: 2026-10-08 build failed while Supabase was paused).
import { afterEach, describe, expect, it, vi } from 'vitest';

const listPromoSitemap = vi.fn();
vi.mock('@/lib/queries', () => ({ listPromoSitemap: () => listPromoSitemap() }));

import sitemap from './sitemap';

afterEach(() => {
  listPromoSitemap.mockReset();
  vi.restoreAllMocks();
});

describe('sitemap', () => {
  it('includes promo URLs when the DB answers', async () => {
    listPromoSitemap.mockResolvedValue([{ id: 'abc', last_seen_at: '2026-10-01T00:00:00.000Z' }]);
    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith('/p/abc'))).toBe(true);
  });

  it('falls back to static entries when the DB is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    listPromoSitemap.mockRejectedValue(new Error('tenant/user not found'));
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].url.endsWith('/')).toBe(true);
    expect(entries.some((e) => e.url.includes('/p/'))).toBe(false);
  });
});
