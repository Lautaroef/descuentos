// Playwright smoke. Loads the home page against a local `pnpm dev` (Playwright's
// `webServer` config spins it up or reuses an existing server) and asserts the
// page shell rendered. This is the single E2E safety net that proves the
// Next.js-on-Postgres pipeline is alive and Playwright is wired correctly —
// Agent 3 will add the real user journeys.
import { expect, test } from '@playwright/test';

test('home renders the Descuentos AR shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Descuentos AR/);
});
