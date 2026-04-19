// Shared Promo fixtures for Vitest component tests.
// Real DB reads are never allowed in component tests — compose Promos from here
// and mutate per-case via the spread operator.
import type { Promo } from '@/lib/schema';

export function makePromo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    source_id: 'modo:coto-abril26',
    source_url: 'https://www.modo.com.ar/promociones/coto-abril26',
    merchant: 'COTO',
    category: 'supermercado',
    wallet: ['modo'],
    card_brand: ['visa'],
    issuer_bank: ['galicia'],
    pct: 25,
    promo_type: 'cashback',
    tope: 12_000,
    tope_period: 'month',
    valid_days: [3],
    valid_regions: [],
    valid_from: '2026-04-01',
    valid_to: '2026-04-30',
    requires_min_spend: null,
    last_seen_at: '2026-04-15T12:00:00.000Z', // 3 days before "today" in tests
    ...overrides,
  };
}

export const MULTI_BANK_PROMO: Promo = makePromo({
  id: '00000000-0000-4000-8000-00000000000b',
  merchant: 'Jumbo',
  pct: 20,
  tope: 8_000,
  tope_period: 'week',
  valid_days: [4],
  issuer_bank: ['galicia', 'santander', 'macro', 'bbva', 'nacion'],
});

export const SIN_TOPE_PROMO: Promo = makePromo({
  id: '00000000-0000-4000-8000-00000000000c',
  merchant: 'Carrefour',
  tope: null,
  tope_period: null,
  valid_days: [0, 1, 2, 3, 4, 5, 6],
});

export const TICKET_TOPE_PROMO: Promo = makePromo({
  id: '00000000-0000-4000-8000-00000000000d',
  merchant: 'Disco',
  tope: 5_000,
  tope_period: 'ticket',
  valid_days: [],
});

export const WEEKLY_PROMO: Promo = makePromo({
  id: '00000000-0000-4000-8000-00000000000e',
  merchant: 'Vea',
  tope: 3_000,
  tope_period: 'week',
});
