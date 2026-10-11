import type { MetadataRoute } from 'next';

/** Makes the dashboard installable as an app on desktop (Chrome/Edge), Android and iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'Cultural Café',
    short_name: 'Cultural Café',
    description: 'Meet someone from another place for an hour. Write in your language; they read it in theirs.',
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
      { name: 'AI Reply Assistant', url: '/app/assistant', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    // Android: "Share" a conversation from a dating app straight into the reply assistant.
    share_target: { action: '/app/assistant', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
  } as MetadataRoute.Manifest;
}
