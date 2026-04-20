// Route-scoped 404 for /banco/[slug]. Next.js walks up the tree looking for
// the closest `not-found.tsx` when a segment calls `notFound()`; without this
// file the global `src/app/not-found.tsx` ("Esta promo no existe") was the
// match, which is wrong copy for a bank landing (it's not a promo page).
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { EmptyState } from '@/components/EmptyState';
import { BANK_SLUGS, BANK_LABELS } from '@/lib/constants';

export default function BancoNotFound() {
  return (
    <>
      <NavBar />
      <main className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-center justify-center px-4 pt-6 text-center">
        <h1 className="sr-only">Banco no encontrado</h1>
        <EmptyState
          headline="Este banco no tiene página de promos."
          subcopy="Puede que todavía no lo sumemos, o que no haya promos activas asociadas."
          cta={{ label: 'Ver todas las promos', href: '/' }}
        />

        <nav className="mt-10 w-full max-w-[520px]">
          <h2 className="mb-3 text-xs font-medium text-text-muted">Bancos con promos activas</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {BANK_SLUGS.map((s) => (
              <Link
                key={s}
                href={`/banco/${s}`}
                className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-[150ms] hover:border-border-strong hover:text-text-primary"
              >
                {BANK_LABELS[s]}
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </>
  );
}
