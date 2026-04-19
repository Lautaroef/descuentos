// Legal-disclaimer sweep. The Ley 24.240 disclaimer MUST appear on every
// page type (context.md + architecture.md — legal posture). Match on a regex
// against the load-bearing phrase "Información referencial" rather than exact
// prose so copy tweaks don't spuriously fail; but removing the disclaimer
// entirely WILL fail the test, which is the contract.
import { expect, test } from '@playwright/test';

const DISCLAIMER_RE = /Información referencial/i;

test.describe('Legal disclaimer presence', () => {
  test.beforeEach(async ({ context }) => {
    // Pre-set the onboarded flag so the modal doesn't overlay the footer.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('descuentos-ar:onboarded', '1');
      } catch {
        /* ignore */
      }
    });
  });

  test('home page contains the disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(DISCLAIMER_RE).first()).toBeVisible();
  });

  test('/banco/[slug] page contains the disclaimer', async ({ page }) => {
    await page.goto('/banco/galicia');
    await expect(page.getByText(DISCLAIMER_RE).first()).toBeVisible();
  });

  test('/categorias/[slug] page contains the disclaimer', async ({ page }) => {
    await page.goto('/categorias/supermercado');
    await expect(page.getByText(DISCLAIMER_RE).first()).toBeVisible();
  });

  test('/p/[id] detail page contains the disclaimer', async ({ page }) => {
    // Find a real promo ID from the home page, then navigate to the detail.
    await page.goto('/');
    const firstCardLink = page.getByRole('link', { name: /Ver detalle de/i }).first();
    await expect(firstCardLink).toBeVisible();
    const href = await firstCardLink.getAttribute('href');
    expect(href).toMatch(/^\/p\//);

    await page.goto(href!);
    await expect(page.getByText(DISCLAIMER_RE).first()).toBeVisible();
  });
});
