import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listPromos, parseFilterFromParams } from '@/lib/queries';
import { PromoList } from '@/components/PromoList';
import { FilterBar } from '@/components/FilterBar';
import { BANK_LABELS, BANK_SLUGS, DISCLAIMER_TEXT, isBankSlug } from '@/lib/constants';
import { formatDateShort } from '@/lib/format';

export const revalidate = 3600;

export function generateStaticParams() {
  return BANK_SLUGS.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isBankSlug(slug)) return { title: 'Banco no encontrado' };
  const label = BANK_LABELS[slug];
  const today = formatDateShort(new Date().toISOString().slice(0, 10));
  return {
    title: `Promos de ${label}`,
    description: `Mejores promos de ${label} en Argentina — actualizado ${today}. Ordenadas por tope de reintegro.`,
    alternates: { canonical: `/banco/${slug}` },
    openGraph: {
      title: `Promos de ${label} — Descuentos AR`,
      description: `Mejores promos de ${label} ordenadas por tope, actualizadas al ${today}.`,
    },
  };
}

export default async function BancoPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  if (!isBankSlug(slug)) notFound();

  const sp = await searchParams;
  const baseFilter = parseFilterFromParams(sp);
  // Pin the bank filter for this landing page — user-added filters are additive.
  const filter = {
    ...baseFilter,
    banks: Array.from(new Set([slug, ...baseFilter.banks])),
  };
  const promos = await listPromos(filter);
  const label = BANK_LABELS[slug];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pt-10">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs tx-muted hover:text-[color:var(--color-text)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Volver
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Promos de {label}</h1>
        <p className="mt-1 text-sm tx-muted">
          {promos.length} {promos.length === 1 ? 'promo activa' : 'promos activas'} ordenadas por
          tope de reintegro.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-token bg-elevated p-4">
        <FilterBar />
      </section>

      <PromoList promos={promos} />

      <nav className="mt-10 border-t border-token pt-6">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide tx-dim">Otros bancos</h2>
        <div className="flex flex-wrap gap-1.5">
          {BANK_SLUGS.filter((s) => s !== slug).map((s) => (
            <Link
              key={s}
              href={`/banco/${s}`}
              className="rounded-full border border-token bg-subtle px-2.5 py-1 text-xs tx-muted hover:text-[color:var(--color-accent)]"
            >
              {BANK_LABELS[s]}
            </Link>
          ))}
        </div>
      </nav>

      <footer className="mt-10 text-xs tx-dim">
        <p>{DISCLAIMER_TEXT}</p>
      </footer>
    </main>
  );
}
