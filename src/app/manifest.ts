import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Descuentos AR',
    short_name: 'Descuentos',
    description:
      'Promos bancarias de Argentina ordenadas por tope de reintegro.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0b',
    theme_color: '#0a0a0b',
    lang: 'es-AR',
    dir: 'ltr',
    orientation: 'portrait',
    categories: ['shopping', 'finance'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
