import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-5xl font-bold tracking-tight">404</h1>
      <p className="mt-3 text-base tx-muted">
        Esta promo o sección no existe. Puede haber expirado, o moverse a otra URL.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-accent-contrast)] transition hover:opacity-90"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
