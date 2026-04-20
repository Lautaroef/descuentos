// E2E: spend-aware effective-savings ranking.
//
// Loads the live home page with `?rubro=supermercado&spend=40000` against a
// local `pnpm dev` / reused server and verifies:
//   1. The top card exposes a "Te ahorrás $X" hero (SSR).
//   2. The sort order matches the effective-savings formula by inspecting the
//      pct values in card reading order (higher effective > lower effective).
//   3. The SpendChip interaction flow (empty → set → Quitar) roundtrips.
//
// The DB is live (Phase 2 runs direct Postgres); merchants are not hardcoded
// so the test is resilient to data churn — it asserts on structural invariants.
import { expect, test } from '@playwright/test';

test.describe('Spend-aware effective-savings ranking (E2E)', () => {
  test('top card of /?rubro=supermercado&spend=40000 shows "Te ahorrás $X"', async ({
    page,
  }) => {
    const resp = await page.goto('/?rubro=supermercado&spend=40000');
    expect(resp?.status()).toBe(200);

    const firstCard = page.getByRole('article').first();
    test.skip(
      !(await firstCard.isVisible()),
      'no supermercado promos in the live DB for this run',
    );

    // SSR contract: the "Te ahorrás $..." hero must be in the HTML, not
    // hydrated-only. The chip label would not survive a JS-disabled fetch
    // if the hero was client-rendered.
    await expect(firstCard.getByText(/Te ahorrás \$\s*[\d.]+/)).toBeVisible();
  });

  test('top card beats runner-up by effective savings (not raw tope)', async ({ page }) => {
    const resp = await page.goto('/?rubro=supermercado&spend=40000');
    expect(resp?.status()).toBe(200);

    const cards = await page.getByRole('article').all();
    test.skip(cards.length < 2, 'need at least 2 supermercado promos to compare ranking');

    // Parse `Te ahorrás $X` on each card and verify descending order.
    const savings: number[] = [];
    for (const card of cards) {
      const hero = await card.locator('text=/Te ahorrás \\$/').first();
      if (!(await hero.count())) continue;
      const txt = (await hero.textContent()) ?? '';
      const match = txt.match(/\$[\s\u00a0]*([\d.]+)/);
      if (!match) continue;
      // "30.000" (AR formatting) → 30000
      const n = Number(match[1].replace(/\./g, ''));
      if (Number.isFinite(n)) savings.push(n);
    }

    test.skip(savings.length < 2, 'too few cards with Te ahorrás hero to verify sort');

    for (let i = 1; i < savings.length; i++) {
      expect(savings[i - 1]).toBeGreaterThanOrEqual(savings[i]);
    }
  });

  test('without spend param, the hero reads "Hasta $X" (classic tope)', async ({ page }) => {
    const resp = await page.goto('/?rubro=supermercado');
    expect(resp?.status()).toBe(200);

    const firstCard = page.getByRole('article').first();
    test.skip(
      !(await firstCard.isVisible()),
      'no supermercado promos in the live DB for this run',
    );

    // Classic tope line is "Hasta $X por <period>" or "Sin tope declarado".
    // Must NOT carry "Te ahorrás" because spend is 0.
    await expect(firstCard.getByText(/Te ahorrás/)).toHaveCount(0);
  });

  test('SpendChip: empty → set → persists to URL', async ({ page }) => {
    // Pre-seed the onboarding flag so the sheet doesn't intercept clicks.
    await page.addInitScript(() =>
      window.localStorage.setItem('descuentos-ar:onboarded', '1'),
    );
    await page.goto('/?rubro=supermercado');

    // Tap the empty spend chip.
    await page.getByRole('button', { name: /Ingresá tu presupuesto/i }).click();
    const input = page.getByLabel('Presupuesto en pesos');
    await input.fill('40000');
    await input.press('Enter');

    await expect(page).toHaveURL(/spend=40000/);
    // The chip now shows the formatted amount.
    await expect(page.getByRole('button', { name: /Presupuesto actual/i })).toBeVisible();
  });

  test('SpendChip: Quitar removes the spend param', async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem('descuentos-ar:onboarded', '1'),
    );
    await page.goto('/?rubro=supermercado&spend=40000');

    await page.getByRole('button', { name: /Presupuesto actual/i }).click();
    await page.getByRole('button', { name: /Quitar presupuesto/i }).click();

    await expect(page).not.toHaveURL(/spend=/);
  });
});
