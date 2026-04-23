import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPromoById } from '@/lib/queries';
import {
  formatDateShort,
  formatPct,
  formatTope,
  formatValidDays,
  topePeriodLabel,
} from '@/lib/format';
import { WALLET_LABELS } from '@/lib/constants';
import { NavBar } from '@/components/NavBar';
import { PromoDetail } from '@/components/PromoDetail';

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
  }. ${formatValidDays(promo.valid_days)}.${
    promo.valid_to ? ` Vigencia hasta ${formatDateShort(promo.valid_to)}.` : ''
  }`;
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

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:pt-10">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors duration-[150ms] hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver al listado
        </Link>

        <PromoDetail promo={promo} />
      </main>
    </>
  );
}
