import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listPromos, parseFilterFromParams } from '@/lib/queries';
import { PromoList } from '@/components/PromoList';
import { FilterBar } from '@/components/FilterBar';
import { NavBar } from '@/components/NavBar';
import { Disclaimer } from '@/components/Disclaimer';
import {
  CATEGORY_LABELS,
  CATEGORY_SLUGS,
  isCategorySlug,
} from '@/lib/constants';
import { formatDateShort } from '@/lib/format';

export const revalidate = 3600;

export function generateStaticParams() {
  return CATEGORY_SLUGS.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isCategorySlug(slug)) return { title: 'Rubro no encontrado' };
  const label = CATEGORY_LABELS[slug];
  const today = formatDateShort(new Date().toISOString().slice(0, 10));
  return {
    title: `Promos en ${label}`,
    description: `Promos de ${label} en Argentina — actualizadas al ${today}. Ordenadas por tope de reintegro.`,
    alternates: { canonical: `/categorias/${slug}` },
    openGraph: {
      title: `Promos en ${label} — Descuentos AR`,
      description: `Promos en ${label} ordenadas por tope, actualizadas al ${today}.`,
    },
  };
}

export default async function CategoriaPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  if (!isCategorySlug(slug)) notFound();

  const sp = await searchParams;
  const baseFilter = parseFilterFromParams(sp);
  const filter = {
    ...baseFilter,
    categories: Array.from(new Set([slug, ...baseFilter.categories])),
  };
  const promos = await listPromos(filter);
  const label = CATEGORY_LABELS[slug];

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-[1120px] px-4 pb-24 pt-6 sm:pt-10 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors duration-[150ms] hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver
        </Link>

        <header className="mb-6">
          <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.015em] text-text-primary">
            Promos en {label}
          </h1>
          <p className="mt-1 text-sm font-medium text-text-secondary">
            {promos.length} {promos.length === 1 ? 'promo activa' : 'promos activas'} · ordenadas por tope
          </p>
        </header>

        <section className="mb-6">
          <FilterBar />
        </section>

        <PromoList promos={promos} />

        <nav className="mt-12 border-t border-border pt-6">
          <h2 className="mb-3 text-xs font-medium text-text-muted">Otros rubros</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_SLUGS.filter((s) => s !== slug).map((s) => (
              <Link
                key={s}
                href={`/categorias/${s}`}
                className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-[150ms] hover:border-border-strong hover:text-text-primary"
              >
                {CATEGORY_LABELS[s]}
              </Link>
            ))}
          </div>
        </nav>

        <Disclaimer variant="home" />
      </main>
    </>
  );
}
