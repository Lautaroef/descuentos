import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, ArrowLeft } from 'lucide-react';
import { getPromoById } from '@/lib/queries';
import {
  formatDateShort,
  formatPct,
  formatTope,
  formatValidDays,
  relativeSpanish,
  topePeriodLabel,
} from '@/lib/format';
import {
  BANK_LABELS,
  CATEGORY_LABELS,
  DISCLAIMER_TEXT,
  WALLET_LABELS,
  isBankSlug,
  isWalletSlug,
} from '@/lib/constants';

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const promo = await getPromoById(id);
  if (!promo) return { title: 'Promo no encontrada' };
  const title = `${promo.merchant} — ${formatPct(promo.pct)} con ${promo.wallet.map((w) => WALLET_LABELS[w] ?? w).join(', ')}`;
  const description = `Reintegro ${formatPct(promo.pct)}${
    promo.tope !== null
      ? `, tope ${formatTope(promo.tope)} ${topePeriodLabel(promo.tope_period)}`
      : ', sin tope'
  }. ${formatValidDays(promo.valid_days)}. Vigencia hasta ${formatDateShort(promo.valid_to)}.`;
  return {
    title,
    description,
    alternates: { canonical: `/p/${id}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function PromoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const promo = await getPromoById(id);
  if (!promo) notFound();

  const banks = promo.issuer_bank ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:pt-10">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs tx-muted hover:text-[color:var(--color-text)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Volver al listado
      </Link>

      <article className="rounded-2xl border border-token bg-elevated p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tx-muted">{CATEGORY_LABELS[promo.category]}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {promo.merchant}
            </h1>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold leading-none text-[color:var(--color-accent)]">
              {formatPct(promo.pct)}
            </div>
            <div className="text-xs tx-muted">reintegro</div>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-4 border-y border-token py-4 sm:grid-cols-3">
          <Field label="Tope de reintegro">
            {formatTope(promo.tope)}
            {promo.tope !== null && (
              <span className="tx-muted"> {topePeriodLabel(promo.tope_period)}</span>
            )}
          </Field>
          <Field label="Días válidos">{formatValidDays(promo.valid_days)}</Field>
          <Field label="Vigencia">
            {formatDateShort(promo.valid_from)} – {formatDateShort(promo.valid_to)}
          </Field>
          <Field label="Billetera">
            {promo.wallet.map((w) => (isWalletSlug(w) ? WALLET_LABELS[w] : w)).join(', ') || '—'}
          </Field>
          {promo.requires_min_spend !== null && (
            <Field label="Compra mínima">
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

        {banks.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide tx-dim">
              Bancos adheridos
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {banks.map((b) => (
                <Link
                  key={b}
                  href={`/banco/${b}`}
                  className="rounded-full border border-token bg-subtle px-2.5 py-1 text-xs tx-muted transition hover:text-[color:var(--color-accent)]"
                >
                  {isBankSlug(b) ? BANK_LABELS[b] : b}
                </Link>
              ))}
            </div>
          </section>
        )}

        {promo.variants && promo.variants.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide tx-dim">
              Tarifas particulares
            </h2>
            <ul className="divide-y divide-[color:var(--color-border)] rounded-xl border border-token bg-subtle/50">
              {promo.variants.map((v, i) => (
                <li key={i} className="flex items-baseline justify-between px-4 py-2 text-sm">
                  <span>
                    <strong>{formatPct(v.pct)}</strong>
                    {v.category_scope && <span className="tx-muted"> · {v.category_scope}</span>}
                    {v.notes && <span className="tx-dim"> ({v.notes})</span>}
                  </span>
                  {v.tope != null && (
                    <span className="tx-muted">
                      {formatTope(v.tope)} {topePeriodLabel(v.tope_period ?? null)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs tx-dim">
            Verificado {relativeSpanish(promo.last_seen_at)} · fuente {promo.source_id}
          </span>
          <a
            href={promo.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-accent-contrast)] transition hover:opacity-90"
          >
            Ir al sitio <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </article>

      <footer className="mt-6 text-xs tx-dim">
        <p className="rounded-xl border border-token bg-subtle/50 p-3">
          {DISCLAIMER_TEXT} No estamos afiliados a {promo.merchant} ni a ninguna de las
          entidades emisoras. Los términos completos pueden variar o actualizarse sin previo
          aviso.
        </p>
      </footer>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-0.5 text-[11px] font-medium uppercase tracking-wide tx-dim">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
