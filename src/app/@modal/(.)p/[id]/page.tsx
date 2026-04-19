// Intercepting route for `/p/[id]`.
//
// Rendered by the `@modal` slot when the user navigates from the SAME level
// as this folder (so: `/`, `/banco/*`, `/categorias/*`) to `/p/[id]`. Next.js
// matches the `(.)p/[id]` segment and inlines this page into the slot
// instead of replacing the `children` tree. The URL updates to `/p/[id]`
// but the underlying list page stays mounted behind the modal — which is
// exactly how scroll state is preserved for free.
//
// Direct URL access (pasting /p/[id], refreshing, share links, SEO crawlers)
// never hits this file — Next skips intercepts on initial loads and renders
// `src/app/p/[id]/page.tsx` as the full page.
//
// Docs:
//   - https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes
//   - https://nextjs.org/docs/app/building-your-application/routing/parallel-routes
import { notFound } from 'next/navigation';
import { getPromoById } from '@/lib/queries';
import { Modal } from '@/components/Modal';
import { PromoDetail } from '@/components/PromoDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InterceptedPromoModal({ params }: PageProps) {
  const { id } = await params;
  const promo = await getPromoById(id);
  if (!promo) notFound();

  return (
    <Modal
      ariaLabel={`Detalle de ${promo.merchant}`}
      fullPageHref={`/p/${id}`}
      fullPageLabel="Ver página completa"
    >
      <PromoDetail promo={promo} compact />
    </Modal>
  );
}
