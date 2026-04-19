'use client';

import type { Promo } from '@/lib/schema';
import { formatPct, formatTope } from '@/lib/format';
import { isZeroPrice, shouldCountUp } from '@/lib/promo-variant';
import { CountUpNumber } from './CountUpNumber';

interface PromoHeroProps {
  promo: Promo;
}

const ARS_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/**
 * Detail-page hero — tope (left) + pct (right) juxtaposed, center-aligned in
 * their halves. Per components.md §4 + direction.md motion spec.
 */
export function PromoHero({ promo }: PromoHeroProps) {
  const zero = isZeroPrice(promo);
  const animate = shouldCountUp(promo);

  const pctLabel = formatPct(promo.pct);

  // Zero-price: pct is the hero. Sin-tope: pct shifts up to 2xl.
  const pctClasses = zero
    ? 'text-[56px] leading-[60px] font-bold text-[color:var(--color-zero-ink)]'
    : promo.tope === null
      ? 'text-[40px] leading-[44px] font-bold text-[color:var(--color-savings)]'
      : 'text-[28px] leading-[34px] font-semibold text-[color:var(--color-savings)]';

  const topeClasses = zero
    ? 'text-lg font-semibold text-[color:var(--color-zero-ink)]'
    : promo.tope === null
      ? 'text-lg font-semibold text-text-primary'
      : 'text-[40px] leading-[44px] font-bold tracking-[-0.02em] text-[color:var(--color-savings-strong)]';

  return (
    <div className="grid grid-cols-2 gap-4 text-center">
      <div className="flex flex-col items-center justify-center">
        {promo.tope === null ? (
          <span className={topeClasses}>Sin tope</span>
        ) : animate ? (
          <CountUpNumber
            value={promo.tope}
            sessionKey={`countup:${promo.id}`}
            format={(n) => ARS_FORMATTER.format(n)}
            className={topeClasses}
          />
        ) : (
          <span className={topeClasses}>{formatTope(promo.tope)}</span>
        )}
        <span className="mt-1 text-xs font-medium text-text-muted">
          {promo.tope === null ? 'reintegro' : 'tope máximo'}
        </span>
      </div>
      <div className="flex flex-col items-center justify-center">
        <span className={pctClasses}>{pctLabel}</span>
        <span className="mt-1 text-xs font-medium text-text-muted">reintegro</span>
      </div>
    </div>
  );
}
