import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { isRtl } from '@conversa/shared';
import { PwaRegister } from '@/components/PwaRegister';
import { UiLocale } from '@/components/UiLocale';
import { messagesFor, ui } from '@/lib/ui';
import { localeFromAcceptLanguage } from '@/lib/ui-locale';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const lang = localeFromAcceptLanguage((await headers()).get('accept-language'));
  return {
    title: 'Cultural Café',
    description: `${ui(lang, 'hero')} ${ui(lang, 'heroSub')}`,
    applicationName: 'Cultural Café',
    appleWebApp: { capable: true, title: 'Cultural Café', statusBarStyle: 'black-translucent' },
    icons: { apple: '/icons/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = {
  themeColor: '#120e0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = localeFromAcceptLanguage((await headers()).get('accept-language'));
  return (
    <html lang={lang} dir={isRtl(lang) ? 'rtl' : 'ltr'}>
      <body className="min-h-screen font-sans">
        <UiLocale lang={lang} pack={messagesFor(lang)}>{children}</UiLocale>
        <PwaRegister />
      </body>
    </html>
  );
}
