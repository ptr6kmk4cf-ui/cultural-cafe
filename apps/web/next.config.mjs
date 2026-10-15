import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=*, geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: mediastream:",
      "style-src 'self' 'unsafe-inline'",
      // Next.js dev needs eval for HMR; production drops it.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  outputFileTracingRoot: path.join(here, '../..'),
  transpilePackages: ['@conversa/shared'],
  serverExternalPackages: ['sharp', 'bcryptjs'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: '/app/matches', destination: '/app/world', permanent: false },
      { source: '/app/shortlist', destination: '/app/world', permanent: false },
      { source: '/app/contacts/:path*', destination: '/app/world', permanent: false },
      { source: '/app/assistant', destination: '/app/world', permanent: false },
      { source: '/app/personality', destination: '/app/world', permanent: false },
      { source: '/app/autopilot', destination: '/app/world', permanent: false },
      { source: '/app/extension', destination: '/app', permanent: false },
      { source: '/app/download', destination: '/app', permanent: false },
      { source: '/app/conversations/:id', destination: '/app/conversations', permanent: false },
    ];
  },
};

export default nextConfig;
