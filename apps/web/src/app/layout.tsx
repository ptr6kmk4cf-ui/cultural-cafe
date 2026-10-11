import type { Metadata, Viewport } from 'next';
import { PwaRegister } from '@/components/PwaRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cultural Café — meet people across cultures in your own language',
  description: 'A one-hour conversation with someone from another place. Write in your language; they read it in theirs.',
  applicationName: 'Cultural Café',
  appleWebApp: { capable: true, title: 'Cultural Café', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#120e0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
