// Deploy-host discovery for SEO surfaces (robots.txt, sitemap.xml).
//
// Precedence:
//   1. `NEXT_PUBLIC_SITE_URL` — explicit override, required for custom domains.
//   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel-injected canonical prod host
//      (the dashboard "Production Domain"). Stable across preview deploys.
//   3. `VERCEL_URL` — per-deployment host (preview URLs, fallback for prod).
//   4. `https://descuentos-six.vercel.app` — last-resort literal matching the
//      current deploy. Only hits when running outside Vercel without env vars.
//
// The literal `descuentos.ar` default was wrong: the deploy lives on
// `descuentos-six.vercel.app`, so robots.txt pointed crawlers at a sitemap
// that doesn't resolve. Moving to a custom domain = set `NEXT_PUBLIC_SITE_URL`.

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(withProtocol(explicit));

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return stripTrailingSlash(withProtocol(vercelProd));

  const vercelDeploy = process.env.VERCEL_URL;
  if (vercelDeploy) return stripTrailingSlash(withProtocol(vercelDeploy));

  return 'https://descuentos-six.vercel.app';
}

function withProtocol(host: string): string {
  if (/^https?:\/\//i.test(host)) return host;
  return `https://${host}`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
