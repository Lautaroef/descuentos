// Vitest smoke test. Renders `PromoCard` with a realistic `Promo` fixture and asserts
// the disclaimer text is present. Exists primarily to verify the vitest + Testing
// Library + happy-dom pipeline wired by this commit — a broken config surfaces here
// before Agents 2 & 3 write real tests.
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PromoCard } from './PromoCard';
import { DISCLAIMER_TEXT } from '@/lib/constants';
import type { Promo } from '@/lib/schema';

const fixture: Promo = {
  id: '00000000-0000-4000-8000-000000000000',
  source_id: 'modo:galicia-abril26',
  source_url: 'https://www.modo.com.ar/promociones/galicia-abril26',
  merchant: 'Galicia',
  category: 'supermercado',
  wallet: ['modo'],
  card_brand: ['visa'],
  issuer_bank: ['galicia'],
  pct: 25,
  promo_type: 'cashback',
  tope: 12_000,
  tope_period: 'week',
  valid_days: [3],
  valid_regions: [],
  valid_from: '2026-04-01',
  valid_to: '2026-04-30',
  requires_min_spend: null,
  last_seen_at: '2026-04-18T12:00:00.000Z',
};

describe('PromoCard smoke', () => {
  it('renders merchant + disclaimer', () => {
    render(<PromoCard promo={fixture} />);

    expect(screen.getByText(fixture.merchant)).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
  });
});
