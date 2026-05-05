import type { Metadata } from 'next';
import { getPromoStats, listPromos, parseFilterFromParams } from '@/lib/queries';
import { FilterBar } from '@/components/FilterBar';
import { PromoList } from '@/components/PromoList';
import { OnboardingSheet } from '@/components/OnboardingSheet';
import { NavBar } from '@/components/NavBar';
import { Disclaimer } from '@/components/Disclaimer';

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
  const [promos, stats] = await Promise.all([
    listPromos(filter),
    getPromoStats(),
  ]);

  const anyFilter =
    filter.wallets.length > 0 ||
    filter.categories.length > 0 ||
    filter.banks.length > 0 ||
    filter.day !== null ||
    filter.region !== null;
  const showingCount = anyFilter && stats.total !== promos.length;

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-[1120px] px-4 pb-24 pt-6 sm:pt-10 sm:px-6 lg:px-8">
        <OnboardingSheet />

        <header className="mb-6">
          <h1 className="flex items-baseline gap-3 text-[28px] font-semibold leading-[34px] tracking-[-0.015em] text-text-primary">
            <span>Descuentos</span>
            <span className="text-text-muted">
              {stats.total} {stats.total === 1 ? 'activa' : 'activas'}
            </span>
          </h1>
        </header>

        <section className="mb-6">
          <FilterBar />
        </section>

        {showingCount && (
          <p className="mb-4 text-sm font-medium text-text-muted">
            Mostrando {promos.length} de {stats.total} promos
          </p>
        )}

        <PromoList promos={promos} spend={filter.spend} />

        <Disclaimer variant="home" />
      </main>
    </>
  );
}
