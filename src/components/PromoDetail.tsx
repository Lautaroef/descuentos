// PromoDetail — the canonical article body for a single promo.
//
// Rendered in two contexts:
//   1. The full-page detail route (`src/app/p/[id]/page.tsx`) — SSR, direct
//      URL / share-link / SEO. The full-page entrypoint wraps this with the
//      NavBar and the "Volver al listado" back link.
//   2. The intercepted modal route (`src/app/@modal/(.)p/[id]/page.tsx`) —
//      rendered inside `<Modal>` chrome when the user clicks a card from
//      the list. Identical content, different frame.
//
// The component is a pure server component so the same JSX streams in both
// contexts. Interactivity for the modal (close button, escape, scroll lock)
// lives in `Modal.tsx` — not here.
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { Promo } from '@/lib/schema';
import {
  daysUntil,
  formatDateShort,
  formatFreshness,
  formatPct,
  formatTope,
  formatValidDays,
  topePeriodLabel,
} from '@/lib/format';
import {
  BANK_LABELS,
  CATEGORY_LABELS,
  WALLET_LABELS,
  isBankSlug,
  isWalletSlug,
} from '@/lib/constants';
import { PromoHero } from '@/components/PromoHero';
import { Disclaimer } from '@/components/Disclaimer';
import { isZeroPrice } from '@/lib/promo-variant';

interface PromoDetailProps {
  promo: Promo;
  /**
   * When true, render the layout with tighter outer spacing suitable for the
   * modal container (no page padding — the modal owns its own padding). The
   * disclaimer still renders below the article in both variants.
   */
  compact?: boolean;
}

export function PromoDetail({ promo, compact = false }: PromoDetailProps) {
  const banks = promo.issuer_bank ?? [];
  const zero = isZeroPrice(promo);
  const ageDays = Math.floor(
    (Date.now() - new Date(promo.last_seen_at).getTime()) / 86_400_000,
  );
  const stale = ageDays > 14;
  const endingDays = daysUntil(promo.valid_to ?? null);

  const heroCardClasses = zero
    ? 'bg-[color:var(--color-zero-bg)]'
    : 'bg-surface';

  // Compact = modal: no outer card border, sits directly inside modal chrome.
  const articleClasses = compact
    ? `${heroCardClasses} p-6 sm:p-8`
    : `rounded-[16px] border border-border ${heroCardClasses} p-6`;

  return (
    <>
      <article className={articleClasses}>
        <p className="text-xs font-medium text-text-muted">
          {CATEGORY_LABELS[promo.category]}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold leading-[34px] tracking-[-0.015em] text-text-primary">
          {promo.merchant}
        </h1>

        <div className="mt-6">
          <PromoHero promo={promo} />
        </div>

        <hr className="my-6 border-t border-divider" />

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Válido">{formatValidDays(promo.valid_days)}</Field>
          <Field label="Vigencia">
            {promo.valid_to
              ? `${formatDateShort(promo.valid_from)} – ${formatDateShort(promo.valid_to)}`
              : 'Sin vigencia declarada'}
            {endingDays !== null && endingDays >= 0 && endingDays <= 3 && (
              <span className="ml-2 font-semibold text-[color:var(--color-warning)]">
                {endingDays === 0
                  ? '· Termina hoy'
                  : endingDays === 1
                    ? '· Termina mañana'
                    : `· Termina en ${endingDays} días`}
              </span>
            )}
          </Field>
          {promo.tope !== null && (
            <Field label="Tope">{topePeriodLabel(promo.tope_period) || '—'}</Field>
          )}
          <Field label="Billetera">
            {promo.wallet
              .map((w) => (isWalletSlug(w) ? WALLET_LABELS[w] : w))
              .join(', ') || '—'}
          </Field>
          {promo.requires_min_spend !== null && (
            <Field label="Compra mín.">
              {new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
                maximumFractionDigits: 0,
              }).format(promo.requires_min_spend)}
            </Field>
          )}
          {promo.valid_regions.length > 0 && (
            <Field label="Regiones">{promo.valid_regions.join(', ')}</Field>
          )}
        </dl>

        {promo.tope === null && (
          <p className="mt-4 text-sm font-medium text-text-secondary">
            Todo tu consumo suma al reintegro — no hay techo declarado.
          </p>
        )}

        {banks.length > 0 && (
          <section className="mt-6 border-t border-divider pt-5">
            <h2 className="mb-2 text-xs font-medium text-text-muted">
              Bancos adheridos
            </h2>
            <div className="flex flex-wrap gap-2">
              {banks.map((b) => {
                // Only render a pill as a clickable <Link> when the slug is
                // a known, routable bank (has a /banco/[slug] SSG entry).
                // Raw upstream slugs like "brubank-ultra" / "naranjax" used to
                // render as <Link> here and 404 on click (P0 audit finding).
                const known = isBankSlug(b);
                const label = known ? BANK_LABELS[b] : b;
                const baseClass =
                  'inline-flex min-h-9 items-center rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary';
                if (known) {
                  return (
                    <Link
                      key={b}
                      href={`/banco/${b}`}
                      className={`${baseClass} transition-colors duration-[150ms] hover:border-border-strong hover:text-text-primary`}
                    >
                      {label}
                    </Link>
                  );
                }
                return (
                  <span
                    key={b}
                    className={baseClass}
                    aria-label={`${label} (sin página dedicada)`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {promo.variants && promo.variants.length > 0 && (
          <section className="mt-6 border-t border-divider pt-5">
            <h2 className="mb-2 text-xs font-medium text-text-muted">
              Tarifas particulares
            </h2>
            <ul className="divide-y divide-[color:var(--color-divider)] rounded-md border border-border bg-surface">
              {promo.variants.map((v, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between px-4 py-3 text-sm"
                >
                  <span>
                    <strong className="font-semibold text-[color:var(--color-savings)]">
                      {formatPct(v.pct)}
                    </strong>
                    {v.category_scope && (
                      <span className="ml-2 text-text-secondary">· {v.category_scope}</span>
                    )}
                    {v.notes && (
                      <span className="ml-2 text-text-muted">({v.notes})</span>
                    )}
                  </span>
                  {v.tope != null && (
                    <span className="text-text-secondary">
                      {formatTope(v.tope)} {topePeriodLabel(v.tope_period ?? null)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex flex-col gap-1 border-t border-divider pt-5 text-xs font-medium text-text-muted">
          <span>{formatFreshness(promo.last_seen_at)}</span>
          <span>Fuente: {promo.source_id}</span>
          {stale && (
            <span className="mt-1 font-medium text-[color:var(--color-warning)]">
              Esta promo podría haber cambiado. Verificá en la app del banco.
            </span>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <a
            href={promo.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[color:var(--color-accent)] px-6 py-3 text-base font-semibold text-[color:var(--color-accent-ink)] transition-colors duration-[150ms] hover:bg-[color:var(--color-accent-hover)] sm:w-auto"
          >
            Ir al sitio
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </article>

      <Disclaimer variant="detail" merchant={promo.merchant} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="text-sm font-medium text-text-primary">{children}</dd>
    </>
  );
}
