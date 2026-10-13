import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { BrandMark } from '@/components/BrandMark';
import { getCurrentUser } from '@/lib/auth';
import { HttpError } from '@/lib/http';
import { claimFriendInvite, isInviteCode, lookupFriendInvite } from '@/lib/services/world';
import { ui } from '@/lib/ui';
import { localeFromAcceptLanguage } from '@/lib/ui-locale';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toLowerCase();
  if (!isInviteCode(code)) notFound();

  const me = await getCurrentUser();
  if (me) {
    try {
      await claimFriendInvite(me.id, code);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) notFound();
    }
    redirect('/app/world?from=friend');
  }

  const host = await lookupFriendInvite(code);
  if (!host) notFound();

  const place = [host.city, host.country].filter(Boolean).join(', ');
  const registerHref = `/register?from=${encodeURIComponent(code)}`;
  const loginHref = `/login?next=${encodeURIComponent(`/join/${code}`)}`;
  const lang = localeFromAcceptLanguage((await headers()).get('accept-language'));
  const t = (key: Parameters<typeof ui>[1], vars?: Parameters<typeof ui>[2]) => ui(lang, key, vars);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <BrandMark />
      <div className="card mt-8 space-y-4">
        <p className="text-xs uppercase tracking-wide text-brand-300">{t('someoneYouKnow')}</p>
        <h1 className="text-2xl font-bold text-white">
          {t('wantsToSit', { name: host.name })}
          {place ? ` ${place}` : ''}
        </h1>
        <p className="text-sm text-ink-300">{t('hero')} {t('heroSub')} {t('friendInvited')}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={registerHref} className="btn-primary">{t('createAccount')}</Link>
          <Link href={loginHref} className="btn-secondary">{t('haveAccount')}</Link>
        </div>
      </div>
    </main>
  );
}
