// Behavior contract for SpendChip.
//
// - Empty state (no `?spend=` and no localStorage) renders the "Ingresá tu
//   presupuesto" chip.
// - Tapping the chip opens an inline numeric input (Enter saves, Escape
//   cancels, blur saves).
// - Saving pushes `?spend=<int>` AND writes to localStorage.
// - When `?spend=30000` is in the URL, the chip shows the formatted amount.
// - Hydration: when URL has no spend but localStorage does, router.replace
//   seeds the URL from storage on mount.
// - The "Quitar" control removes the spend value.
//
// Routing is mocked at the `next/navigation` boundary. Everything else
// renders for real via happy-dom.
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

async function loadSpendChip() {
  const mod = await import('./SpendChip');
  return mod.SpendChip;
}

const SPEND_STORAGE_KEY = 'descuentos-ar:spend';

function pushedParamSpend(): string | null {
  const url = pushMock.mock.calls[pushMock.mock.calls.length - 1]?.[0];
  if (typeof url !== 'string') return null;
  const qs = url.includes('?') ? url.split('?')[1] : '';
  return new URLSearchParams(qs).get('spend');
}

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  searchParamsMock = new URLSearchParams();
  try {
    localStorage.clear();
  } catch {
    /* happy-dom quirk */
  }
});

afterEach(() => {
  cleanup();
});

describe('SpendChip — empty state', () => {
  it('renders "Ingresá tu presupuesto" when no spend is set', async () => {
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    expect(screen.getByRole('button', { name: /Ingresá tu presupuesto/i })).toBeInTheDocument();
  });

  it('tapping the chip opens an editable inline input with focus', async () => {
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ingresá tu presupuesto/i }));

    const input = screen.getByLabelText('Presupuesto en pesos') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // queueMicrotask focuses — wait a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(input);
  });

  it('typing + Enter saves to URL and localStorage', async () => {
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ingresá tu presupuesto/i }));
    const input = screen.getByLabelText('Presupuesto en pesos');
    await user.type(input, '30000');
    await user.keyboard('{Enter}');

    expect(pushMock).toHaveBeenCalled();
    expect(pushedParamSpend()).toBe('30000');
    expect(localStorage.getItem(SPEND_STORAGE_KEY)).toBe('30000');
  });

  it('typing + Escape cancels without saving', async () => {
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ingresá tu presupuesto/i }));
    const input = screen.getByLabelText('Presupuesto en pesos');
    await user.type(input, '30000');
    await user.keyboard('{Escape}');

    expect(pushMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(SPEND_STORAGE_KEY)).toBeNull();
    // Chip returns to the empty state.
    expect(screen.getByRole('button', { name: /Ingresá tu presupuesto/i })).toBeInTheDocument();
  });

  it('strips non-numeric characters from the input', async () => {
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ingresá tu presupuesto/i }));
    const input = screen.getByLabelText('Presupuesto en pesos') as HTMLInputElement;
    await user.type(input, '30.000,50 ARS');

    expect(input.value).toBe('3000050'); // all digits survived, separators dropped
  });

  it('empty input + Enter returns to empty state and does not persist spend', async () => {
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ingresá tu presupuesto/i }));
    await user.keyboard('{Enter}');

    // localStorage never receives a 0 value — that key is either absent or empty.
    expect(localStorage.getItem(SPEND_STORAGE_KEY)).toBeNull();
    // Any URL push that happened did NOT include a spend param.
    const url = pushMock.mock.calls[pushMock.mock.calls.length - 1]?.[0];
    if (typeof url === 'string') {
      expect(url).not.toContain('spend=');
    }
    // The chip is back in its empty state.
    expect(screen.getByRole('button', { name: /Ingresá tu presupuesto/i })).toBeInTheDocument();
  });
});

describe('SpendChip — set state (URL has ?spend=)', () => {
  it('renders the formatted amount when URL carries ?spend=30000', async () => {
    searchParamsMock = new URLSearchParams('spend=30000');
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    // Intl 'es-AR' formats as "$ 30.000" (with non-breaking space) or "$30.000".
    // Use a regex resilient to either.
    expect(screen.getByRole('button', { name: /Presupuesto actual: \$\s*30\.000/ })).toBeInTheDocument();
  });

  it('tapping the set chip opens the editor pre-filled with the current value', async () => {
    searchParamsMock = new URLSearchParams('spend=30000');
    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Presupuesto actual/i }));

    const input = screen.getByLabelText('Presupuesto en pesos') as HTMLInputElement;
    expect(input.value).toBe('30000');
  });

  it('the "Quitar" button clears the spend param and localStorage', async () => {
    searchParamsMock = new URLSearchParams('spend=30000');
    localStorage.setItem(SPEND_STORAGE_KEY, '30000');

    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Presupuesto actual/i }));
    await user.click(screen.getByRole('button', { name: /Quitar presupuesto/i }));

    expect(pushMock).toHaveBeenCalled();
    // URL ends up as "/" (no query) — the spend param is gone.
    const url = pushMock.mock.calls[pushMock.mock.calls.length - 1][0] as string;
    expect(url).toBe('/');
    expect(localStorage.getItem(SPEND_STORAGE_KEY)).toBeNull();
  });
});

describe('SpendChip — localStorage hydration', () => {
  it('seeds ?spend= from localStorage on mount when URL has no spend', async () => {
    localStorage.setItem(SPEND_STORAGE_KEY, '40000');

    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    // useEffect fires on mount → router.replace('/?spend=40000').
    await new Promise((r) => setTimeout(r, 0));

    expect(replaceMock).toHaveBeenCalled();
    const arg = replaceMock.mock.calls[0][0] as string;
    expect(arg).toContain('spend=40000');
  });

  it('does NOT overwrite an existing URL ?spend=', async () => {
    searchParamsMock = new URLSearchParams('spend=10000');
    localStorage.setItem(SPEND_STORAGE_KEY, '40000');

    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    await new Promise((r) => setTimeout(r, 0));

    // URL had spend=10000 already → no replace fired.
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('ignores an invalid value in localStorage', async () => {
    localStorage.setItem(SPEND_STORAGE_KEY, 'not-a-number');

    const SpendChip = await loadSpendChip();
    render(<SpendChip />);

    await new Promise((r) => setTimeout(r, 0));

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
