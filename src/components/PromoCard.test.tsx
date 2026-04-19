// Behavior contract for PromoCard.
//
// The UI is v0 and will be redesigned — tests here check **what the user sees**
// (merchant, pct, tope, topé period phrasing, valid-days phrasing, bank chips,
// disclaimer, source link) NOT visuals (classnames, spacing, colors).
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PromoCard } from './PromoCard';
import { DISCLAIMER_TEXT } from '@/lib/constants';
import {
  MULTI_BANK_PROMO,
  SIN_TOPE_PROMO,
  TICKET_TOPE_PROMO,
  WEEKLY_PROMO,
  makePromo,
} from '../../tests/fixtures/promo-fixtures';

describe('PromoCard — behavior contract', () => {
  it('renders merchant name, category, and pct as a percentage', () => {
    render(<PromoCard promo={makePromo({ merchant: 'COTO', pct: 25 })} />);

    expect(screen.getByRole('heading', { name: 'COTO' })).toBeInTheDocument();
    expect(screen.getByText('Supermercado')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('formats tope as ARS currency with the period phrased in Spanish', () => {
    // "por mes" — the contract
    render(<PromoCard promo={makePromo({ tope: 12_000, tope_period: 'month' })} />);
    // Match on the formatted currency. Intl 'es-AR' emits non-breaking-space:
    // "$ 12.000" (char codes 36, 160, 49, 50, 46, 48, 48, 48). Use a regex so the
    // test is resilient to Intl's exact whitespace choice.
    expect(screen.getByText(/\$\s*12\.000/)).toBeInTheDocument();
    expect(screen.getByText(/por mes/i)).toBeInTheDocument();
  });

  it('supports weekly tope period phrasing', () => {
    render(<PromoCard promo={WEEKLY_PROMO} />);
    expect(screen.getByText(/por semana/i)).toBeInTheDocument();
  });

  it('supports per-ticket tope period phrasing', () => {
    render(<PromoCard promo={TICKET_TOPE_PROMO} />);
    expect(screen.getByText(/por ticket/i)).toBeInTheDocument();
  });

  it('renders human-readable valid_days — "Sólo los miércoles" for [3]', () => {
    render(<PromoCard promo={makePromo({ valid_days: [3] })} />);
    expect(screen.getByText(/Sólo los miércoles/i)).toBeInTheDocument();
  });

  it('renders "Todos los días" for a full-week valid_days', () => {
    render(<PromoCard promo={makePromo({ valid_days: [0, 1, 2, 3, 4, 5, 6] })} />);
    expect(screen.getByText(/Todos los días/i)).toBeInTheDocument();
  });

  it('shows up to 3 adhered bank chips and collapses the rest', () => {
    render(<PromoCard promo={MULTI_BANK_PROMO} />);

    // Labels come from BANK_LABELS
    expect(screen.getByText('Banco Galicia')).toBeInTheDocument();
    expect(screen.getByText('Santander')).toBeInTheDocument();
    expect(screen.getByText('Banco Macro')).toBeInTheDocument();
    // 4th and 5th banks should NOT appear as chips
    expect(screen.queryByText('BBVA')).not.toBeInTheDocument();
    expect(screen.queryByText('Banco Nación')).not.toBeInTheDocument();
    // Overflow indicator
    expect(screen.getByText(/… y 2 más/)).toBeInTheDocument();
  });

  it('renders "Verificado" + relative Spanish time for last_seen_at', () => {
    render(<PromoCard promo={makePromo({ last_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })} />);
    expect(screen.getByText(/Verificado hace 2 días/i)).toBeInTheDocument();
  });

  it('renders "Verificado recién" when last_seen_at is just now', () => {
    render(<PromoCard promo={makePromo({ last_seen_at: new Date().toISOString() })} />);
    expect(screen.getByText(/Verificado recién/i)).toBeInTheDocument();
  });

  it('links the card to its detail page /p/<id>', () => {
    const promo = makePromo({ id: '11111111-2222-4333-8444-555555555555' });
    render(<PromoCard promo={promo} />);
    const detailLink = screen.getByRole('link', { name: /Ver detalle de/i });
    expect(detailLink).toHaveAttribute('href', `/p/${promo.id}`);
  });

  it('includes the legal disclaimer (sr-only is fine — it must exist in the DOM)', () => {
    render(<PromoCard promo={makePromo()} />);
    // Use getAllByText because the literal text might repeat across fragments;
    // contract is simply "disclaimer is present at least once".
    expect(screen.getAllByText(DISCLAIMER_TEXT).length).toBeGreaterThanOrEqual(1);
  });

  describe('Sin tope case', () => {
    it('renders "Sin tope" and does NOT render a period phrase', () => {
      render(<PromoCard promo={SIN_TOPE_PROMO} />);
      const tope = screen.getByText('Sin tope');
      expect(tope).toBeInTheDocument();

      // Its parent <dd> must not contain "por mes" / "por semana" / "por día" / "por ticket".
      const dd = tope.closest('dd');
      expect(dd).not.toBeNull();
      expect(within(dd as HTMLElement).queryByText(/por (mes|semana|día|ticket)/i)).toBeNull();
    });
  });
});
