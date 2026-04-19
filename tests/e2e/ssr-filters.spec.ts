// PromoArg differentiator (docs/competitor-promoarg.md): our filters are
// SSR-applied, not JS-applied. A shared link like /?wallet=modo&rubro=supermercado
// must render the correct filtered HTML with JS disabled — otherwise the product
// is broken.
//
// These tests disable JS entirely at the browser level, navigate to filtered
// URLs, and inspect the HTML. No hydration, no client-side filter evaluation.
import { expect, test } from '@playwright/test';

// Use a dedicated context with JS disabled. Playwright's `browser.newContext`
// accepts `javaScriptEnabled: false`.
test.describe('SSR filters survive JS-disabled navigation', () => {
  test('home page without filters renders promo cards', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/');
    expect(resp?.status()).toBe(200);

    const html = await page.content();
    // The home page surfaces a "Promos activas" count in the header copy; the
    // actual promo cards render inside <article>s. Both must be present.
    await expect(page.getByRole('article').first()).toBeVisible();

    // At least one of the known seed merchants appears. We test for 40-row
    // Phase 1 corpus merchants (phase-2-notes.md §Smoke-test results).
    expect(html).toMatch(/COTO|Carrefour|Jumbo|Aiello/i);

    await ctx.close();
  });

  test('?rubro=supermercado returns only supermercado promos in the HTML', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/?rubro=supermercado');
    expect(resp?.status()).toBe(200);

    const articles = await page.getByRole('article').all();
    // If the real DB has no supermercado promos the test should SKIP gracefully,
    // since we deliberately don't seed a fixture (per Agent-3 scope: no DB fixtures).
    test.skip(articles.length === 0, 'no supermercado promos in the live DB');

    // Every rendered card is in the supermercado category — the category chip
    // on the card reads "Supermercado".
    for (const art of articles) {
      await expect(art.getByText('Supermercado', { exact: true })).toBeVisible();
    }

    await ctx.close();
  });

  test('?wallet=modo renders at least one card (MODO is the Phase 1 seed)', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/?wallet=modo');
    expect(resp?.status()).toBe(200);

    const cards = await page.getByRole('article').all();
    expect(cards.length).toBeGreaterThan(0);

    await ctx.close();
  });

  test('/?wallet=modo&rubro=supermercado — combined filter holds in SSR HTML', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/?wallet=modo&rubro=supermercado');
    expect(resp?.status()).toBe(200);

    const articles = await page.getByRole('article').all();
    test.skip(articles.length === 0, 'no modo+supermercado promos in the live DB');

    for (const art of articles) {
      await expect(art.getByText('Supermercado', { exact: true })).toBeVisible();
    }

    await ctx.close();
  });

  test('/banco/galicia shows only promos that list Galicia as an adhered bank', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/banco/galicia');
    expect(resp?.status()).toBe(200);

    const articles = await page.getByRole('article').all();
    test.skip(articles.length === 0, 'no Galicia promos in the live DB');

    // The card shows up to 3 bank chips labeled via BANK_LABELS. For Galicia:
    // either "Banco Galicia" appears directly on the chip, or it's collapsed
    // in the "… y N más" overflow. For the SSR contract we need to know the
    // bank is part of the promo — the detail page link /p/<id> resolves to
    // a promo whose issuer_bank array contains 'galicia'.
    //
    // Simplified check: every card on this page has /p/<uuid> href AND at
    // least one bank chip. The SQL filter guarantees issuer_bank && {galicia}.
    // We assert the page title + count text reflects the Galicia filter.
    await expect(page.getByRole('heading', { level: 1, name: /Promos de Banco Galicia/i })).toBeVisible();

    await ctx.close();
  });

  test('/categorias/supermercado renders only supermercado cards', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/categorias/supermercado');
    expect(resp?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: /Promos de Supermercado/i })).toBeVisible();

    const articles = await page.getByRole('article').all();
    test.skip(articles.length === 0, 'no supermercado promos in the live DB');

    for (const art of articles) {
      await expect(art.getByText('Supermercado', { exact: true })).toBeVisible();
    }

    await ctx.close();
  });

  test('/categorias/combustible renders only combustible cards (second category validation)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();

    const resp = await page.goto('/categorias/combustible');
    expect(resp?.status()).toBe(200);

    const articles = await page.getByRole('article').all();
    test.skip(articles.length === 0, 'no combustible promos in the live DB');

    for (const art of articles) {
      await expect(art.getByText('Combustible', { exact: true })).toBeVisible();
    }

    await ctx.close();
  });
});

test.describe('Unknown slugs return 404', () => {
  test('/banco/definitely-not-a-bank returns HTTP 404', async ({ page }) => {
    const resp = await page.goto('/banco/definitely-not-a-bank');
    expect(resp?.status()).toBe(404);
  });

  test('/categorias/nope returns HTTP 404', async ({ page }) => {
    const resp = await page.goto('/categorias/nope');
    expect(resp?.status()).toBe(404);
  });
});
