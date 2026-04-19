import type { Metadata, Viewport } from 'next';
import './globals.css';

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
    statusBarStyle: 'black-translucent',
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
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
