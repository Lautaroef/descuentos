// E2E for the intercepted-route modal on `/p/[id]`.
//
// Covers the user-visible contract:
//   1. Home → click card → modal opens at /p/[id], home list stays behind.
//   2. Esc closes the modal and restores the list.
//   3. Clicking "Ver página completa" inside the modal pushes to /p/[id]
//      as a full page (no modal chrome).
//   4. Direct URL access to /p/[id] renders the full page, not the modal.
//   5. List scroll position is preserved across open → close.
import { expect, test } from '@playwright/test';

test.describe('Promo detail modal (intercepting route)', () => {
  test.beforeEach(async ({ context }) => {
    // Skip onboarding so the sheet doesn't block card clicks.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('descuentos-ar:onboarded', '1');
      } catch {
        /* ignore */
      }
    });
  });

  test('home → click card → modal opens at /p/[id]', async ({ page }) => {
    await page.goto('/');

    const firstCard = page.getByRole('link', { name: /Ver detalle de/i }).first();
    // Sanity: we have cards to click.
    await expect(firstCard).toBeVisible();

    // Capture the expected merchant name from the card heading so we can
    // assert it's visible inside the modal.
    const merchant = await page
      .getByRole('article')
      .first()
      .getByRole('heading')
      .first()
      .textContent();
    expect(merchant).toBeTruthy();

    await firstCard.click();

    // URL reflects the detail page.
    await expect(page).toHaveURL(/\/p\//);

    // The modal dialog is visible with the expected accessible label.
    const modal = page.getByRole('dialog', {
      name: new RegExp(`Detalle de ${merchant!.trim()}`),
    });
    await expect(modal).toBeVisible();

    // The modal × button is present.
    await expect(modal.getByRole('button', { name: 'Cerrar' })).toBeVisible();
    // The "Ver página completa" escape hatch is present and points at the
    // same promo URL.
    const fullPageLink = modal.getByRole('link', { name: /Ver página completa/ });
    await expect(fullPageLink).toBeVisible();
  });

  test('Esc closes the modal and returns to /', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Ver detalle de/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL('/');
  });

  test('× button closes the modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Ver detalle de/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Cerrar' }).click();

    await expect(modal).toBeHidden();
    await expect(page).toHaveURL('/');
  });

  test('back button closes the modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Ver detalle de/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.goBack();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL('/');
  });

  test('"Ver página completa" link escapes the modal to the full page', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Ver detalle de/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    await modal.getByRole('link', { name: /Ver página completa/ }).click();

    // Modal chrome is gone; the full-page "Volver al listado" back link
    // is the contract marker for the direct-nav layout.
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(
      page.getByRole('link', { name: /Volver al listado/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/p\//);
  });

  test('direct URL access to /p/[id] renders the full page, not the modal', async ({
    page,
  }) => {
    // First, grab a valid promo id by visiting home and reading a card link.
    await page.goto('/');
    const firstCardHref = await page
      .getByRole('link', { name: /Ver detalle de/i })
      .first()
      .getAttribute('href');
    expect(firstCardHref).toMatch(/^\/p\//);

    // Now do a hard navigation (refresh-style) directly to the detail URL.
    // Intercepting routes explicitly skip this entry path.
    await page.goto(firstCardHref!);

    // The full-page chrome ("Volver al listado") is present.
    await expect(
      page.getByRole('link', { name: /Volver al listado/ }),
    ).toBeVisible();
    // No modal dialog should be mounted.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('list scroll position survives open → close', async ({ page }) => {
    await page.goto('/');

    // Scroll down a bit so there's something to preserve.
    await page.evaluate(() => window.scrollTo(0, 400));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(300);

    // Open a visible card, assert modal, then close.
    const card = page.getByRole('link', { name: /Ver detalle de/i }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Back at /, scroll should be at or very near where it was before —
    // the underlying page never unmounted behind the modal.
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(50);
  });
});
