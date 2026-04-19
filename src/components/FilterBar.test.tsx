// Behavior contract for FilterBar.
//
// The wedge (product.md) requires URL-truth filters — so tests assert that chip
// clicks call `router.push` with the right URL, multi-select accumulates, and
// the Reset control returns to a clean URL. Routing is mocked at the
// `next/navigation` boundary; everything else renders for real.
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Navigation mock ---------------------------------------------------------

const pushMock = vi.fn();
const replaceMock = vi.fn();
let searchParamsMock = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsMock,
}));

// Dynamic import so the vi.mock above applies.
async function loadFilterBar() {
  const mod = await import('./FilterBar');
  return mod.FilterBar;
}

// ---- Helpers ----------------------------------------------------------------

/** Wrap pushMock so we can inspect the pathname+query that was pushed. */
function lastPushedUrl(): string | null {
  if (pushMock.mock.calls.length === 0) return null;
  const arg = pushMock.mock.calls[pushMock.mock.calls.length - 1][0];
  return typeof arg === 'string' ? arg : null;
}

function lastPushedParams(): URLSearchParams {
  const url = lastPushedUrl();
  if (!url) return new URLSearchParams();
  const i = url.indexOf('?');
  return new URLSearchParams(i >= 0 ? url.slice(i + 1) : '');
}

// ---- Setup ------------------------------------------------------------------

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  searchParamsMock = new URLSearchParams();
  try {
    localStorage.clear();
  } catch {
    /* happy-dom quirk — ignore */
  }
});

afterEach(() => {
  cleanup();
});

// ---- Tests ------------------------------------------------------------------

describe('FilterBar — URL-truth contract', () => {
  it('initial selection reflects URL params (wallet + rubro + día)', async () => {
    searchParamsMock = new URLSearchParams('wallet=modo&rubro=supermercado&dia=3');
    const FilterBar = await loadFilterBar();

    render(<FilterBar />);

    // aria-pressed=true on the selected chips
    expect(screen.getByRole('button', { name: /^MODO/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Supermercado/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The "Miércoles" day chip is pressed when ?dia=3.
    expect(
      screen.getByRole('button', { name: 'Filtrar por día: Miércoles' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a wallet chip pushes a URL that includes ?wallet=<slug>', async () => {
    const FilterBar = await loadFilterBar();
    render(<FilterBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^MODO/ }));

    expect(pushMock).toHaveBeenCalled();
    const params = lastPushedParams();
    expect(params.get('wallet')).toBe('modo');
  });

  it('multi-select accumulates — two wallet clicks produce ?wallet=modo,mercadopago', async () => {
    const FilterBar = await loadFilterBar();
    const { rerender } = render(<FilterBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^MODO/ }));

    // Simulate the URL updating as Next.js would (push → new searchParams).
    const firstPush = lastPushedUrl();
    expect(firstPush).toContain('wallet=modo');
    searchParamsMock = new URLSearchParams(firstPush!.split('?')[1] ?? '');
    rerender(<FilterBar />);

    pushMock.mockClear();
    await user.click(screen.getByRole('button', { name: /^Mercado Pago/ }));

    const params = lastPushedParams();
    const wallets = (params.get('wallet') ?? '').split(',').filter(Boolean).sort();
    expect(wallets).toEqual(['mercadopago', 'modo']);
  });

  it('clicking a selected wallet chip again removes it from the URL', async () => {
    searchParamsMock = new URLSearchParams('wallet=modo');
    const FilterBar = await loadFilterBar();
    render(<FilterBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^MODO/ }));

    const params = lastPushedParams();
    expect(params.get('wallet')).toBeNull();
  });

  it('Reset button clears all filters from the URL', async () => {
    searchParamsMock = new URLSearchParams('wallet=modo&rubro=supermercado&dia=3&region=CABA');
    const FilterBar = await loadFilterBar();
    render(<FilterBar />);

    const user = userEvent.setup();
    const reset = screen.getByRole('button', { name: /Limpiar filtros/i });
    expect(reset).toBeEnabled();

    await user.click(reset);

    // push was called with a bare pathname (no query string).
    const url = lastPushedUrl();
    expect(url).toBe('/');
  });

  it('Reset button is hidden when no filters are active', async () => {
    const FilterBar = await loadFilterBar();
    render(<FilterBar />);

    expect(screen.queryByRole('button', { name: /Limpiar filtros/i })).toBeNull();
  });

  it('clicking a día chip pushes ?dia=<n>', async () => {
    const FilterBar = await loadFilterBar();
    render(<FilterBar />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Filtrar por día: Miércoles' }));

    const params = lastPushedParams();
    expect(params.get('dia')).toBe('3');
  });

  it('hydrates owned-wallet selection from localStorage when URL has no wallet', async () => {
    localStorage.setItem('descuentos-ar:owned-wallets', 'modo,mercadopago');

    const FilterBar = await loadFilterBar();
    render(<FilterBar />);

    // useEffect fires on mount → router.replace with ?wallet=modo,mercadopago
    // Wait a microtask for the effect.
    await new Promise((r) => setTimeout(r, 0));

    expect(replaceMock).toHaveBeenCalled();
    const arg = replaceMock.mock.calls[0][0] as string;
    const params = new URLSearchParams(arg.split('?')[1] ?? '');
    const wallets = (params.get('wallet') ?? '').split(',').sort();
    expect(wallets).toEqual(['mercadopago', 'modo']);
  });
});
