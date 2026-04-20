// P0 regression — taxonomy bleed on /p/[id] detail pages.
//
// Symptom (audit): raw upstream slugs like "brubank-ultra" and "naranjax" were
// rendered as clickable pills under "Bancos adheridos", linking to `/banco/<slug>`
// — which 404'd with wrong copy ("Esta promo no existe"). Fix: only slugs in
// `BANK_SLUGS` render as <a>; unknown slugs render as non-clickable <span>s.
//
// Contract here: on a detail page, every clickable bank pill must resolve 200
// (never 404). We scrape all `href="/banco/..."` links under the Bancos section
// and fetch each. Zero 404s is the pass condition.
import { expect, test } from '@playwright/test';

test.describe('Detail page bank pills', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('descuentos-ar:onboarded', '1');
      } catch {
        /* ignore */
      }
    });
  });

  test('every clickable bank pill on a detail page returns HTTP 200', async ({
    page,
    request,
  }) => {
    // Walk: home → first card → detail. The home always renders at least one
    // card with an issuer_bank cluster in the live DB; if it ever didn't, this
    // test would skip gracefully below.
    await page.goto('/');
    const firstCard = page.getByRole('link', { name: /Ver detalle de/i }).first();
    await firstCard.click();
    await page.waitForURL(/\/p\//);

    // Scope the query to the "Bancos adheridos" section so we don't match the
    // NavBar or footer cross-links. Pull hrefs from <a> tags only — raw slugs
    // without a known route are rendered as <span> and intentionally excluded.
    const pillLinks = page.locator(
      'section:has(h2:has-text("Bancos adheridos")) a[href^="/banco/"]',
    );
    const hrefs = await pillLinks.evaluateAll((els) =>
      (els as HTMLAnchorElement[]).map((a) => a.getAttribute('href')),
    );

    // Some detail pages have no banks section (single-wallet promo). Iterate
    // through cards until we find one that actually has pills to test. If none
    // exists in the top-20 cards, something structural is wrong — fail loudly.
    if (hrefs.length === 0) {
      await page.goto('/');
      const cards = await page
        .getByRole('link', { name: /Ver detalle de/i })
        .all();
      for (const card of cards.slice(0, 20)) {
        await card.click();
        await page.waitForURL(/\/p\//);
        const hrefsHere = await page
          .locator('section:has(h2:has-text("Bancos adheridos")) a[href^="/banco/"]')
          .evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => a.getAttribute('href')));
        if (hrefsHere.length > 0) {
          hrefs.push(...hrefsHere);
          break;
        }
        await page.goBack();
      }
      expect(hrefs.length, 'at least one detail page must expose bank pills').toBeGreaterThan(0);
    }

    // Fetch every pill destination. 404 = taxonomy bleed regression.
    for (const href of hrefs) {
      const resp = await request.get(href!);
      expect(
        resp.status(),
        `bank pill "${href}" must not 404`,
      ).toBeLessThan(400);
    }
  });
});
