// Critical user paths per Agent-3 spec. Covers:
// - Home → filter click → URL updates → results change → card click → detail
//   → browser back preserves filter state.
// - Share-link flow: `/?rubro=supermercado&dia=3` opens directly with chips
//   pre-selected and results already filtered.
// - Onboarding first-visit E2E: clean localStorage → sheet appears → select
//   wallets → save → URL updated → subsequent visits don't re-prompt.
import { expect, test } from '@playwright/test';

test.describe('Critical user paths', () => {
  test.beforeEach(async ({ context }) => {
    // Start every test with the onboarded flag pre-set so the sheet doesn't
    // block filter / navigation interactions (dedicated onboarding test below
    // clears this).
    await context.addInitScript(() => {
      try {
        localStorage.setItem('descuentos-ar:onboarded', '1');
      } catch {
        /* ignore */
      }
    });
  });

  test('home → click wallet filter → URL updates → click card → detail → back', async ({
    page,
  }) => {
    await page.goto('/');

    // Click the MODO chip in the FilterBar. Chips are <button> with aria-pressed.
    const modoChip = page.getByRole('button', { name: /^MODO/ }).first();
    await modoChip.click();

    // URL reflects the filter.
    await expect(page).toHaveURL(/[?&]wallet=modo(,|$|&)/);

    // Open the first card.
    const firstCard = page.getByRole('link', { name: /Ver detalle de/i }).first();
    const merchantHeading = await page
      .getByRole('article')
      .first()
      .getByRole('heading')
      .first()
      .textContent();
    expect(merchantHeading).toBeTruthy();

    await firstCard.click();

    // Detail page renders with the expected merchant as the <h1>.
    await expect(page).toHaveURL(/\/p\//);
    await expect(
      page.getByRole('heading', { level: 1, name: merchantHeading!.trim() }),
    ).toBeVisible();

    // Browser back → home with the filter still applied.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]wallet=modo(,|$|&)/);
    await expect(page.getByRole('button', { name: /^MODO/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('share-link flow: chips are pre-selected on direct load', async ({ page }) => {
    await page.goto('/?rubro=supermercado&dia=3');

    // Rubro chip "Supermercado" is aria-pressed=true.
    await expect(page.getByRole('button', { name: /^Supermercado/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The "Miércoles" day chip is pressed when ?dia=3.
    await expect(
      page.getByRole('button', { name: 'Filtrar por día: Miércoles' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('Reset button on home clears all filters', async ({ page }) => {
    await page.goto('/?wallet=modo&rubro=supermercado&dia=3');

    const reset = page.getByRole('button', { name: /Limpiar filtros/i });
    await expect(reset).toBeVisible();
    await reset.click();

    await expect(page).toHaveURL('/');
  });
});

test.describe('Onboarding first-visit E2E', () => {
  test('sheet appears on first visit, saves wallets, and does not re-prompt', async ({
    page,
    context,
  }) => {
    // Ensure clean localStorage — DO NOT pre-set the onboarded flag.
    await context.clearCookies();
    // addInitScript needs to go on the context BEFORE navigation
    await context.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });

    await page.goto('/');

    // Sheet step 1: the "Guardar" button is a reliable accessibility marker.
    const save = page.getByRole('button', { name: /^Guardar$/ });
    await expect(save).toBeVisible();

    // Click a wallet tile (inside the sheet) — tiles use voseo aria-labels
    // "Seleccionar MODO" / "Deseleccionar MODO".
    await page.getByRole('button', { name: /Seleccionar MODO/i }).first().click();
    await save.click();

    // URL gets `wallet=modo` as soon as step 1 commits.
    await expect(page).toHaveURL(/[?&]wallet=modo(,|$|&)/);

    // Step 2: optional spend question. "Ahora no" skips it and closes.
    await page.getByRole('button', { name: /^Ahora no$/ }).click();
    await expect(save).toBeHidden();

    // Reload → onboarding sheet MUST NOT reappear.
    await page.reload();
    await expect(page.getByRole('button', { name: /^Guardar$/ })).toHaveCount(0);
  });
});
