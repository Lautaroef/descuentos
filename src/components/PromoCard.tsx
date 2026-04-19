import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Promo } from '@/lib/schema';
import {
  formatPct,
  formatTope,
  formatValidDays,
  relativeSpanish,
  topePeriodLabel,
} from '@/lib/format';
import { BANK_LABELS, CATEGORY_LABELS, DISCLAIMER_TEXT, isBankSlug } from '@/lib/constants';

interface PromoCardProps {
  promo: Promo;
}

export function PromoCard({ promo }: PromoCardProps) {
  const banks = promo.issuer_bank ?? [];
  const shownBanks = banks.slice(0, 3);
  const extra = banks.length - shownBanks.length;

  return (
    <article className="group relative flex flex-col gap-3 rounded-2xl border border-token bg-elevated p-4 transition hover:border-[color:var(--color-accent)]">
      <Link
        href={`/p/${promo.id}`}
        className="absolute inset-0 rounded-2xl"
        aria-label={`Ver detalle de ${promo.merchant}`}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{promo.merchant}</h3>
          <p className="text-xs tx-muted">{CATEGORY_LABELS[promo.category]}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-none text-[color:var(--color-accent)]">
            {formatPct(promo.pct)}
          </div>
          <div className="text-xs tx-muted">reintegro</div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide tx-dim">Tope</dt>
          <dd className="font-medium">
            {formatTope(promo.tope)}
            {promo.tope !== null && (
              <span className="tx-muted"> {topePeriodLabel(promo.tope_period)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide tx-dim">Vigencia</dt>
          <dd className="font-medium tx-muted">{formatValidDays(promo.valid_days)}</dd>
        </div>
      </dl>

      {banks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shownBanks.map((b) => (
            <span
              key={b}
              className="rounded-full border border-token bg-subtle px-2 py-0.5 text-[11px] tx-muted"
            >
              {isBankSlug(b) ? BANK_LABELS[b] : b}
            </span>
          ))}
          {extra > 0 && (
            <span className="rounded-full border border-token bg-subtle px-2 py-0.5 text-[11px] tx-dim">
              … y {extra} más
            </span>
          )}
        </div>
      )}

      <footer className="flex items-center justify-between text-[11px] tx-dim">
        <span>Verificado {relativeSpanish(promo.last_seen_at)}</span>
        <span className="inline-flex items-center gap-1 group-hover:text-[color:var(--color-accent)]">
          Ver detalle
          <ArrowRight className="h-3 w-3" />
        </span>
      </footer>

      <p className="sr-only">{DISCLAIMER_TEXT}</p>
    </article>
  );
}
