// Behavior contract for PromoList.
//
// Two contracts:
// 1. Sort order — the list renders promos in the order received (SQL does the
//    sort; PromoList must NOT re-sort). Null-tope rows go to a collapsed
//    secondary section so they don't pollute the main ranking (product.md).
// 2. Sin-tope section — rows are present in the DOM but inside an aria-expanded
//    collapsible; clicking the toggle reveals them.
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PromoList } from './PromoList';
import { makePromo } from '../../tests/fixtures/promo-fixtures';

afterEach(() => {
  cleanup();
});

describe('PromoList — ordering + sin-tope section', () => {
  it('renders promos with tope in the order received (SQL-sorted, no re-sort)', () => {
    // Simulate SQL "tope DESC NULLS LAST, pct DESC" output.
    const promos = [
      makePromo({ id: 'a', merchant: 'COTO', tope: 20_000, pct: 30 }),
      makePromo({ id: 'b', merchant: 'Jumbo', tope: 10_000, pct: 25 }),
      makePromo({ id: 'c', merchant: 'Carrefour', tope: 5_000, pct: 20 }),
    ];

    render(<PromoList promos={promos} />);

    const mainList = screen.getByRole('list', {
      name: /Promos con tope, ordenadas por monto mayor/i,
    });
    const merchantHeadings = within(mainList).getAllByRole('heading');
    expect(merchantHeadings.map((h) => h.textContent)).toEqual(['COTO', 'Jumbo', 'Carrefour']);
  });

  it('splits sin-tope promos into a separate collapsed section', () => {
    const promos = [
      makePromo({ id: 'a', merchant: 'COTO', tope: 20_000 }),
      makePromo({ id: 'b', merchant: 'Disco', tope: null, tope_period: null }),
      makePromo({ id: 'c', merchant: 'Vea', tope: null, tope_period: null }),
    ];

    render(<PromoList promos={promos} />);

    // Sin-tope count surfaced in the toggle
    const toggle = screen.getByRole('button', { name: /2 promos sin tope declarado/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Sin-tope rows are NOT yet rendered (collapsed by default)
    expect(screen.queryByRole('heading', { name: 'Disco' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Vea' })).toBeNull();
  });

  it('clicking the sin-tope toggle reveals the hidden cards', async () => {
    const promos = [
      makePromo({ id: 'a', merchant: 'COTO', tope: 20_000 }),
      makePromo({ id: 'b', merchant: 'Disco', tope: null, tope_period: null }),
    ];

    render(<PromoList promos={promos} />);

    const toggle = screen.getByRole('button', { name: /1 promo sin tope declarado/i });
    const user = userEvent.setup();
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Disco' })).toBeInTheDocument();
  });

  it('renders an empty-state message when no promos match', () => {
    render(<PromoList promos={[]} />);
    expect(screen.getByText(/No hay promos con esos filtros hoy/i)).toBeInTheDocument();
  });

  it('renders just sin-tope promos without a main section when all topes are null', () => {
    const promos = [makePromo({ id: 'a', merchant: 'Disco', tope: null, tope_period: null })];
    render(<PromoList promos={promos} />);

    expect(
      screen.queryByRole('list', { name: /Promos con tope, ordenadas por monto mayor/i }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: /1 promo sin tope declarado/i })).toBeInTheDocument();
  });
});
