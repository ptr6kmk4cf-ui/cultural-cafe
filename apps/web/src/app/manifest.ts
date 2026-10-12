import type { MetadataRoute } from 'next';

/** Makes the dashboard installable as an app on desktop (Chrome/Edge), Android and iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'Cultural Café',
    short_name: 'Cultural Café',
    description: 'Take a table with an adult in another country. You write in your own language. They read a live translation.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#120e0a',
    theme_color: '#120e0a',
    categories: ['lifestyle', 'social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Café', url: '/app/world', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  } as MetadataRoute.Manifest;
}
