'use client';

// Route-level error boundary. If a server render fails (for example the
// database is unreachable or paused), visitors get a branded, retryable page
// instead of the bare Next.js 500 screen. NavBar is kept so the site still
// looks like itself.
import { useEffect } from 'react';
import { NavBar } from '@/components/NavBar';
import { EmptyState } from '@/components/EmptyState';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <NavBar />
      <main className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-center justify-center px-4 pt-6 text-center">
        <h1 className="sr-only">Error temporal</h1>
        <EmptyState
          headline="No pudimos cargar las promos."
          subcopy="Es un problema temporal de nuestro lado. Probá de nuevo en unos minutos."
          cta={{ label: 'Reintentar', onClick: reset }}
        />
      </main>
    </>
  );
}
