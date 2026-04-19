import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-inter',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Descuentos AR — Mejores promos ordenadas por tope',
    template: '%s · Descuentos AR',
  },
  description:
    'Descuentos y promociones bancarias en Argentina ordenadas por tope de reintegro. Filtrá por billetera, rubro y día.',
  applicationName: 'Descuentos AR',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Descuentos AR',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'Descuentos AR',
    title: 'Descuentos AR — Mejores promos ordenadas por tope',
    description:
      'Descuentos y promociones bancarias en Argentina ordenadas por tope de reintegro.',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#FBF9F5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /**
   * Parallel `@modal` slot — renders the intercepted detail view as an
   * overlay above `children`. When no intercept matches the current URL,
   * `src/app/@modal/default.tsx` returns null so this prop is an empty
   * fragment.
   */
  modal: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="min-h-screen bg-bg text-text-primary">
        {children}
        {modal}
      </body>
    </html>
  );
}
