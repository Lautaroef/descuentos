import type { MetadataRoute } from 'next';
import { listPromoSitemap } from '@/lib/queries';
import { BANK_SLUGS, CATEGORY_SLUGS } from '@/lib/constants';
import { getSiteUrl } from '@/lib/site-url';

// Generate the sitemap from the DB. Copies PromoArg's `/p/<uuid>` URL shape per
// competitor-promoarg.md (SEO parity). `lastModified` = each promo's `last_seen_at`.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const promos = await listPromoSitemap();
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
