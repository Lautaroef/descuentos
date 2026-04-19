import type { Metadata } from 'next';
import Link from 'next/link';
import { getPromoStats, listPromos, parseFilterFromParams } from '@/lib/queries';
import { FilterBar } from '@/components/FilterBar';
import { PromoList } from '@/components/PromoList';
import { OnboardingSheet } from '@/components/OnboardingSheet';
import { DISCLAIMER_TEXT } from '@/lib/constants';
import { relativeSpanish } from '@/lib/format';

export const revalidate = 3600; // ISR every hour — ingestion runs weekly.

export const metadata: Metadata = {
  title: 'Descuentos AR — Mejores promos ordenadas por tope',
  alternates: { canonical: '/' },
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filter = parseFilterFromParams(sp);
  const [promos, stats] = await Promise.all([listPromos(filter), getPromoStats()]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pt-10">
      <OnboardingSheet />

      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Descuentos AR</h1>
            <p className="mt-1 text-sm tx-muted">
              Promos ordenadas por <strong className="text-[color:var(--color-accent)]">tope de reintegro</strong>,
              de mayor a menor. {stats.total} activas
              {stats.lastSeen && (
                <>
                  {' '}
                  · última verificación {relativeSpanish(stats.lastSeen)}
                </>
              )}
              .
            </p>
          </div>
          <nav className="flex gap-2 text-xs tx-muted">
            <Link
              href="/banco/modo"
              className="rounded-md border border-token bg-subtle px-2.5 py-1.5 hover:text-[color:var(--color-text)]"
            >
              Por banco
            </Link>
            <Link
              href="/categorias/supermercado"
              className="rounded-md border border-token bg-subtle px-2.5 py-1.5 hover:text-[color:var(--color-text)]"
            >
              Por rubro
            </Link>
          </nav>
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-token bg-elevated p-4">
        <FilterBar />
      </section>

      <PromoList promos={promos} />

      <footer className="mt-16 border-t border-token pt-6 text-xs tx-dim">
        <p>{DISCLAIMER_TEXT}</p>
        <p className="mt-1">
          No estamos afiliados a ningún banco ni billetera. Consultá los términos y
          condiciones en la fuente original antes de comprar.
        </p>
      </footer>
    </main>
  );
}
