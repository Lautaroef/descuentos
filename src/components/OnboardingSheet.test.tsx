// Behavior contract for OnboardingSheet.
//
// - Shown on first visit (no localStorage flag)
// - NOT shown when the onboarding flag exists
// - Selecting wallets + "Guardar" writes to localStorage AND triggers a URL
//   update (router.replace) with ?wallet=<selected>
// - URL overrides onboarding: if ?wallet=x is already in the URL, the user has
//   effectively onboarded already — the sheet MUST NOT clobber that selection.
//   (We verify by asserting the user's existing URL params are preserved if the
//   sheet does mount.)
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

async function loadOnboardingSheet() {
  const mod = await import('./OnboardingSheet');
  return mod.OnboardingSheet;
}

const ONBOARD_KEY = 'descuentos-ar:onboarded';
const WALLET_STORAGE_KEY = 'descuentos-ar:owned-wallets';

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  searchParamsMock = new URLSearchParams();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('OnboardingSheet — first-visit behavior', () => {
  it('is shown on first visit when onboarding flag is absent', async () => {
    const OnboardingSheet = await loadOnboardingSheet();
    render(<OnboardingSheet />);

    // "Guardar" CTA is how we identify the sheet being open — an accessible role
    // check rather than a classname or test-id.
    expect(screen.getByRole('button', { name: /Guardar/i })).toBeInTheDocument();
  });

  it('is NOT shown when onboarding flag is already set in localStorage', async () => {
    localStorage.setItem(ONBOARD_KEY, '1');

    const OnboardingSheet = await loadOnboardingSheet();
    render(<OnboardingSheet />);

    // Wait a tick for the useEffect to run.
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByRole('button', { name: /Guardar/i })).toBeNull();
  });

  it('selecting wallets + Guardar persists to localStorage AND pushes URL with ?wallet=', async () => {
    const OnboardingSheet = await loadOnboardingSheet();
    render(<OnboardingSheet />);

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^MODO/ }));
    await user.click(screen.getByRole('button', { name: /^Mercado Pago/ }));
    await user.click(screen.getByRole('button', { name: /^Guardar$/ }));

    // localStorage contract
    expect(localStorage.getItem(ONBOARD_KEY)).toBe('1');
    const stored = (localStorage.getItem(WALLET_STORAGE_KEY) ?? '').split(',').sort();
    expect(stored).toEqual(['mercadopago', 'modo']);

    // URL contract — sheet uses router.replace to update the URL on save.
    expect(replaceMock).toHaveBeenCalled();
    const arg = replaceMock.mock.calls[0][0] as string;
    const params = new URLSearchParams(arg.split('?')[1] ?? '');
    const wallets = (params.get('wallet') ?? '').split(',').sort();
    expect(wallets).toEqual(['mercadopago', 'modo']);
  });

  it('"Ahora no" (skip) sets the onboarded flag but does NOT write owned-wallets', async () => {
    const OnboardingSheet = await loadOnboardingSheet();
    render(<OnboardingSheet />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ahora no/i }));

    expect(localStorage.getItem(ONBOARD_KEY)).toBe('1');
    expect(localStorage.getItem(WALLET_STORAGE_KEY)).toBeNull();
    // Skipping should not push a URL change.
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('URL param preservation — saving merges onto existing searchParams', async () => {
    // User lands via a shared link with ?rubro=supermercado. Save onboarding should
    // add ?wallet=modo WITHOUT stomping ?rubro=supermercado.
    searchParamsMock = new URLSearchParams('rubro=supermercado');

    const OnboardingSheet = await loadOnboardingSheet();
    render(<OnboardingSheet />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^MODO/ }));
    await user.click(screen.getByRole('button', { name: /^Guardar$/ }));

    const arg = replaceMock.mock.calls[0][0] as string;
    const params = new URLSearchParams(arg.split('?')[1] ?? '');
    expect(params.get('rubro')).toBe('supermercado');
    expect(params.get('wallet')).toBe('modo');
  });
});
