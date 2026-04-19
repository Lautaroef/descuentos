import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Descuentos AR',
    short_name: 'Descuentos',
    description:
      'Promos bancarias de Argentina ordenadas por tope de reintegro.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBF9F5',
    theme_color: '#FBF9F5',
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
