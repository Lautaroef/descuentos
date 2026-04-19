// Behavior contract for WalletPicker.
//
// Tests assert user-visible behavior:
//   - Both sections render (Billeteras virtuales + Bancos tradicionales)
//   - Tile click toggles selection (onChange called with the right set)
//   - Search filters tiles live
//   - "Seleccionar todos" selects every currently-visible item
//   - "Deseleccionar" clears every currently-visible item
//   - Empty search shows the "no results" message
//
// No logo-network tests — the favicon URLs are stable strings from the
// resolver, the DOM contract is simply that they render. Visual regression
// isn't tested here by design (per agent brief).
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletPicker, buildDefaultPickerItems } from './WalletPicker';

const onChangeMock = vi.fn();

beforeEach(() => {
  onChangeMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('WalletPicker — default catalog', () => {
  it('renders both group headers', () => {
    render(<WalletPicker selected={new Set()} onChange={onChangeMock} />);
    expect(screen.getByText(/Billeteras virtuales/i)).toBeInTheDocument();
    expect(screen.getByText(/Bancos tradicionales/i)).toBeInTheDocument();
  });

  it('renders a tile for MODO with pressed state reflecting the selection', () => {
    const { rerender } = render(
      <WalletPicker selected={new Set()} onChange={onChangeMock} />,
    );
    const btn = screen.getByRole('button', { name: /Seleccionar MODO/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    rerender(<WalletPicker selected={new Set(['modo'])} onChange={onChangeMock} />);
    expect(
      screen.getByRole('button', { name: /Deseleccionar MODO/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a tile fires onChange with the toggled slug added', async () => {
    render(<WalletPicker selected={new Set()} onChange={onChangeMock} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Seleccionar MODO/ }));
    expect(onChangeMock).toHaveBeenCalled();
    const next = onChangeMock.mock.calls[0][0] as Set<string>;
    expect(next.has('modo')).toBe(true);
  });

  it('clicking a selected tile fires onChange with the slug removed', async () => {
    render(
      <WalletPicker selected={new Set(['modo', 'mercadopago'])} onChange={onChangeMock} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Deseleccionar MODO/ }));
    const next = onChangeMock.mock.calls[0][0] as Set<string>;
    expect(next.has('modo')).toBe(false);
    expect(next.has('mercadopago')).toBe(true);
  });
});

describe('WalletPicker — search', () => {
  it('filters tiles live while typing', async () => {
    render(<WalletPicker selected={new Set()} onChange={onChangeMock} />);
    const user = userEvent.setup();

    const search = screen.getByRole('searchbox');
    await user.type(search, 'modo');

    // MODO should still be visible
    expect(screen.getByRole('button', { name: /Seleccionar MODO/ })).toBeInTheDocument();
    // A wallet that doesn't match — "Lemon" — should be gone
    expect(screen.queryByRole('button', { name: /Lemon/ })).toBeNull();
  });

  it('shows the empty-match hint when no tiles match the query', async () => {
    render(<WalletPicker selected={new Set()} onChange={onChangeMock} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'zzzzzzzzz');
    expect(
      screen.getByText(/No encontramos nada con ese nombre/i),
    ).toBeInTheDocument();
  });
});

describe('WalletPicker — bulk toggles', () => {
  it('"Seleccionar todos" selects every visible item, scoped to the search', async () => {
    render(<WalletPicker selected={new Set()} onChange={onChangeMock} />);
    const user = userEvent.setup();

    // Narrow to just "modo"
    await user.type(screen.getByRole('searchbox'), 'modo');
    await user.click(screen.getByRole('button', { name: /Seleccionar todos/i }));

    const next = onChangeMock.mock.calls.at(-1)![0] as Set<string>;
    expect(next.has('modo')).toBe(true);
    // Not-matching items don't get added
    expect(next.has('lemon')).toBe(false);
  });

  it('"Deseleccionar" clears every visible item, preserving non-visible selections', async () => {
    render(
      <WalletPicker
        selected={new Set(['modo', 'mercadopago', 'uala', 'lemon'])}
        onChange={onChangeMock}
      />,
    );
    const user = userEvent.setup();

    // Narrow to just "modo" and deselect visible
    await user.type(screen.getByRole('searchbox'), 'modo');
    await user.click(screen.getByRole('button', { name: /^Deseleccionar$/i }));

    const next = onChangeMock.mock.calls.at(-1)![0] as Set<string>;
    expect(next.has('modo')).toBe(false);
    // Non-visible selections preserved
    expect(next.has('lemon')).toBe(true);
    expect(next.has('uala')).toBe(true);
  });

  it('"Seleccionar todos" is disabled when every visible tile is already selected', () => {
    const items = buildDefaultPickerItems();
    const allSlugs = new Set(items.map((i) => i.slug));
    render(<WalletPicker selected={allSlugs} onChange={onChangeMock} />);

    const btn = screen.getByRole('button', { name: /Seleccionar todos/i });
    expect(btn).toBeDisabled();
  });
});
