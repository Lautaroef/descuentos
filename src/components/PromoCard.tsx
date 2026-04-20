import Link from 'next/link';
import type { Promo } from '@/lib/schema';
import {
  expiringLabel,
  formatFreshness,
  formatPct,
  formatTopeLine,
  formatValidDays,
} from '@/lib/format';
import { BANK_LABELS, CATEGORY_LABELS, DISCLAIMER_TEXT, isBankSlug } from '@/lib/constants';
import { MerchantAvatar } from './MerchantAvatar';
import { promoVariant } from '@/lib/promo-variant';
import { effectiveSavings } from '@/lib/queries-coerce';

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

interface PromoCardProps {
  promo: Promo;
  /**
   * Optional planned spend (integer ARS). When > 0 and the promo has real
   * cashback, the tope line turns into a `Te ahorrás $X` hero — the user
   * sees the money back they can actually expect for their spend instead of
   * the abstract cap. Defaults to 0 (classic tope-line display).
   */
  spend?: number;
}

/**
 * PromoCard — the hero component.
 *
 * Hierarchy (per direction.md):
 *   tope line (hero) > pct > merchant > category/valid_days > bank pills > footer.
 *
 * Variants (per components.md):
 *   default · sin-tope · expiring-soon · zero-price (yellow tint).
 */
export function PromoCard({ promo, spend = 0 }: PromoCardProps) {
  const banks = promo.issuer_bank ?? [];
  const shownBanks = banks.slice(0, 3);
  const extra = banks.length - shownBanks.length;
  const variant = promoVariant(promo);
  const expiring = expiringLabel(promo.valid_to ?? null);
  const isZero = variant === 'zero';

  const surfaceClasses = isZero
    ? 'bg-[color:var(--color-zero-bg)]'
    : 'bg-surface';

  // Spend-aware hero gating. When spend > 0 and the promo actually pays
  // cashback (cashback/mixed + pct>0), the tope line is supplemented with
  // `Te ahorrás $X`. For cuotas / pct=0 we fall through to the tope copy —
  // "Te ahorrás $0" would insult the user per spec.
  const savings = effectiveSavings(promo, spend);
  const showSavingsHero = spend > 0 && savings > 0 && !isZero;
  const effectiveIsAtTope =
    showSavingsHero && promo.tope !== null && savings >= promo.tope;

  // Zero-price tope-line replacement copy.
  let topeLine: string;
  if (isZero) {
    topeLine = 'Es gratis';
  } else if (showSavingsHero) {
    topeLine = `Te ahorrás ${ARS.format(savings)}`;
  } else if (variant === 'sin-tope') {
    topeLine = 'Sin tope declarado';
  } else {
    topeLine = formatTopeLine(promo.tope, promo.tope_period);
  }

  // Secondary line below the hero when the savings-hero is active. This
  // contextualizes the savings with the underlying tope.
  let secondaryLine: string | null = null;
  if (showSavingsHero) {
    if (promo.tope === null) {
      secondaryLine = 'Sin tope declarado';
    } else if (effectiveIsAtTope) {
      secondaryLine = 'Tope alcanzado';
    } else {
      secondaryLine = formatTopeLine(promo.tope, promo.tope_period);
    }
  }

  // Pct sizing rules:
  // - zero-price: 56px (text-3xl) weight 700, near-black ink.
  // - sin-tope (non-zero): 28px (text-2xl) weight 700, savings green.
  // - default: 20px (text-xl) weight 600, savings green.
  const pctClasses = isZero
    ? 'text-[56px] leading-[60px] font-bold text-[color:var(--color-zero-ink)]'
    : variant === 'sin-tope'
      ? 'text-[28px] leading-[34px] font-bold text-[color:var(--color-savings)]'
      : 'text-[20px] leading-[28px] font-semibold text-[color:var(--color-savings)]';

  const topeClasses =
    variant === 'sin-tope' && !isZero
      ? 'text-base font-semibold text-text-primary'
      : isZero
        ? 'text-base font-medium text-[color:var(--color-zero-ink)]'
        : 'text-base font-semibold text-[color:var(--color-savings-strong)]';

  return (
    <article
      className={`group relative flex flex-col gap-3 overflow-hidden rounded-md border border-border ${surfaceClasses} p-4 transition-all duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border-strong hover:shadow-1 active:scale-[0.99]`}
      style={{ minHeight: 196 }}
    >
      {variant === 'expiring' && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-0 h-[3px] bg-[color:var(--color-warning)]"
        />
      )}

      <Link
        href={`/p/${promo.id}`}
        className="absolute inset-0 rounded-md"
        aria-label={`Ver detalle de ${promo.merchant}`}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MerchantAvatar name={promo.merchant} size={32} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-text-primary">
              {promo.merchant}
            </h3>
            <p className="mt-1 text-xs font-medium text-text-muted">
              {CATEGORY_LABELS[promo.category]}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={pctClasses}>{formatPct(promo.pct)}</div>
          <div className="text-xs font-medium text-text-muted">reintegro</div>
        </div>
      </header>

      <div className="flex flex-col gap-1">
        <p className={topeClasses}>{topeLine}</p>
        {secondaryLine && (
          <p className="text-xs font-medium text-text-muted">
            {effectiveIsAtTope && (
              <span
                aria-hidden="true"
                className="mr-1 text-[color:var(--color-savings)]"
              >
                ✓
              </span>
            )}
            {secondaryLine}
          </p>
        )}
        {promo.valid_days && promo.valid_days.length > 0 && (
          <p className="text-sm font-medium text-text-secondary">
            {formatValidDays(promo.valid_days)}
          </p>
        )}
      </div>

      {banks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shownBanks.map((b) => (
            <span
              key={b}
              className="rounded-pill bg-surface-sunken px-2 py-1 text-xs font-medium text-text-secondary"
            >
              {isBankSlug(b) ? BANK_LABELS[b] : b}
            </span>
          ))}
          {extra > 0 && (
            <span className="rounded-pill bg-surface-sunken px-2 py-1 text-xs font-medium text-text-muted">
              …y {extra} más
            </span>
          )}
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between border-t border-divider pt-3 text-xs font-medium">
        <span className={expiring ? 'font-semibold text-[color:var(--color-warning)]' : 'text-text-muted'}>
          {expiring ?? formatFreshness(promo.last_seen_at)}
        </span>
        <span className="inline-flex items-center gap-1 text-[color:var(--color-accent)] group-hover:text-[color:var(--color-accent-hover)]">
          Ver →
        </span>
      </footer>

      <p className="sr-only">{DISCLAIMER_TEXT}</p>
    </article>
  );
}
