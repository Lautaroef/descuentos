import { NavBar } from '@/components/NavBar';
import { EmptyState } from '@/components/EmptyState';

export default function NotFound() {
  return (
    <>
      <NavBar />
      <main className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-center justify-center px-4 pt-6 text-center">
        <h1 className="sr-only">404</h1>
        <EmptyState
          headline="Esta promo no existe."
          subcopy="Puede que la hayamos dado de baja porque ya no está vigente."
          cta={{ label: 'Ver promos', href: '/' }}
        />
      </main>
    </>
  );
}
