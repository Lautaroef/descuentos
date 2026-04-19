// Compute visual variant for a Promo per docs/design/direction.md.
//
// - "zero-price" (categorical): pct===100 OR promo_type==='2x1'
//   OR (promo_type==='bonificado' AND pct>=50).
// - "sin-tope": tope === null.
// - "expiring": valid_to within 3 days.
// - "default": everything else.
//
// Precedence: zero-price > expiring > sin-tope > default. A sin-tope card can
// still be flagged "expiring" (both states are non-exclusive on the visuals
// but for primary styling we pick the loudest).

import type { Promo } from './schema';
import { daysUntil } from './format';

export type PromoVariantKind = 'default' | 'sin-tope' | 'expiring' | 'zero';

export function isZeroPrice(promo: Promo): boolean {
  // The current Promo schema (`scripts/promo-schema.ts`) enumerates
  // `promo_type` as 'cashback' | 'cuotas' | 'mixed' — 2×1/bonificado are not
  // represented today. D3 spec anticipates both via future schema evolution;
  // for v1 we only detect 100% reintegro as the zero-price categorical.
  const n = typeof promo.pct === 'string' ? Number(promo.pct) : promo.pct;
  return n === 100;
}

export function isExpiring(promo: Promo, now = new Date()): boolean {
  const d = daysUntil(promo.valid_to ?? null, now);
  return d !== null && d >= 0 && d <= 3;
}

export function promoVariant(promo: Promo, now = new Date()): PromoVariantKind {
  if (isZeroPrice(promo)) return 'zero';
  if (isExpiring(promo, now)) return 'expiring';
  if (promo.tope === null) return 'sin-tope';
  return 'default';
}

/**
 * Count-up trigger threshold — tope ≥ 5000 OR pct ≥ 20 per direction.md
 * motion spec. Used on PromoDetail hero.
 */
export function shouldCountUp(promo: Promo): boolean {
  const n = typeof promo.pct === 'string' ? Number(promo.pct) : promo.pct;
  if ((promo.tope ?? 0) >= 5_000) return true;
  if (n >= 20) return true;
  return false;
}
