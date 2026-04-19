// P2/P3 sweep:
// - PWA install-affordance floor: manifest link in <head> + service worker
//   registers without console errors. (Full PWA install flow can't be
//   automated.)
// - Sitemap contains /p/ and /banco/ URLs.
// - robots.txt disallows /api/.
import { expect, test } from '@playwright/test';

test.describe('PWA install affordance', () => {
  test('home page advertises the web manifest in <head>', async ({ page }) => {
    await page.goto('/');

    // <link rel="manifest" href="/manifest.webmanifest">. Select via DOM —
    // the exact href is set by next/metadata.
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    const href = await manifestLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!).toMatch(/manifest/);
  });

  test('manifest.webmanifest is served with valid JSON', async ({ request }) => {
    const resp = await request.get('/manifest.webmanifest');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    // App manifest must declare a name and display mode per Serwist config.
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('display');
  });

  test('service worker registers without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    // Give Serwist a tick to kick off registration.
    await page.waitForTimeout(500);

    // No hard errors. (Serwist can log informational messages; we only fail on
    // `error` level.)
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Sitemap + robots contract', () => {
  test('sitemap.xml returns 200 and includes at least one /p/ URL', async ({ request }) => {
    const resp = await request.get('/sitemap.xml');
    expect(resp.status()).toBe(200);
    const body = await resp.text();

    expect(body).toContain('<urlset');
    // At least one promo detail URL and one bank landing URL.
    expect(body).toMatch(/\/p\/[0-9a-f-]{36}/);
    expect(body).toMatch(/\/banco\//);
    expect(body).toMatch(/\/categorias\//);
  });

  test('robots.txt disallows /api/', async ({ request }) => {
    const resp = await request.get('/robots.txt');
    expect(resp.status()).toBe(200);
    const body = await resp.text();
    expect(body).toMatch(/Disallow:\s*\/api\//i);
  });
});
