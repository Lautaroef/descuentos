import type { MetadataRoute } from 'next';
import { listPromoSitemap } from '@/lib/queries';
import { BANK_SLUGS, CATEGORY_SLUGS } from '@/lib/constants';
import { getSiteUrl } from '@/lib/site-url';

// Generate the sitemap from the DB. Copies PromoArg's `/p/<uuid>` URL shape per
// competitor-promoarg.md (SEO parity). `lastModified` = each promo's `last_seen_at`.
//
// The sitemap is prerendered at build time, so a DB outage (e.g. Supabase pausing
// the Free-plan project, 2026-10-08) used to fail the whole deploy. If the DB is
// unreachable we ship the static entries and let the daily revalidation add the
// promo URLs back once the DB answers.
export const revalidate = 86400;

async function loadPromoEntries(): Promise<Awaited<ReturnType<typeof listPromoSitemap>>> {
  try {
    return await listPromoSitemap();
  } catch (err) {
    console.error('[sitemap] promo query failed; serving static entries only', err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const promos = await loadPromoEntries();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
  ];

  for (const slug of BANK_SLUGS) {
    entries.push({
      url: `${base}/banco/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const slug of CATEGORY_SLUGS) {
    entries.push({
      url: `${base}/categorias/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const p of promos) {
    entries.push({
      url: `${base}/p/${p.id}`,
      lastModified: new Date(p.last_seen_at),
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  return entries;
}
