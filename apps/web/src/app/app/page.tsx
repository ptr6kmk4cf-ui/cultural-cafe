import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { InviteFriend } from '@/components/InviteFriend';
import { PastSitList } from '@/components/PastSitList';
import { PracticeTableButton } from '@/components/PracticeTableButton';
import { WaitingInvites } from '@/components/WaitingInvites';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { serializePastHours } from '@/lib/services/world';
import { ui } from '@/lib/ui';
import { localeFromAcceptLanguage } from '@/lib/ui-locale';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const [photos, profile, cafeRows] = await Promise.all([
    db.photo.count({ where: { userId: user.id } }),
    db.worldProfile.findUnique({ where: { userId: user.id } }),
    db.worldConversation.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ]);
  const cafeHours = await serializePastHours(cafeRows, user.id);
  const profileReady = !!profile?.city?.trim() && !!profile.optedIn;
  const past = cafeHours
    .filter((c) => c.status !== 'ACTIVE')
    .sort((a, b) => Number(!!b.peer?.online) - Number(!!a.peer?.online));
  const lang = localeFromAcceptLanguage((await headers()).get('accept-language'));
  const t = (key: Parameters<typeof ui>[1], vars?: Parameters<typeof ui>[2]) => ui(lang, key, vars);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">{t('hi', { name: user.name })}</h1>
        <p className="mt-1 text-ink-300">{t('saveThenMeet')}</p>
      </div>

      <ol className="space-y-3">
        <li className="card flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${profileReady ? 'bg-emerald-500 text-white' : 'bg-brand-500 text-white'}`}>
              {profileReady ? '✓' : '1'}
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">{t('yourProfile')}</h2>
              <p className="mt-1 text-sm text-ink-300">
                {profileReady
                  ? `${profile?.city}${profile?.country ? `, ${profile.country}` : ''}. ${t('peopleSeeReady')}`
                  : t('addCity')}
              </p>
              <p className="mt-2 text-xs text-ink-400">
                {t('optional')}{' '}
                <Link href="/app/languages" className="text-brand-300 hover:underline">{t('languageYouRead')}</Link>
                {' · '}
                <Link href="/app/photos" className="text-brand-300 hover:underline">{photos > 0 ? t('yourPhoto') : t('addPhoto')}</Link>
              </p>
            </div>
          </div>
          <Link href="/app/world" className={profileReady ? 'btn-secondary' : 'btn-primary'}>
            {profileReady ? t('editProfile') : t('openProfile')}
          </Link>
        </li>
        <li className={`card flex flex-wrap items-center justify-between gap-4 ${profileReady ? '' : 'opacity-80'}`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${profileReady ? 'bg-brand-500 text-white' : 'border border-white/20 text-ink-300'}`}>2</span>
            <div>
              <h2 className="text-lg font-bold text-white">{t('meetSomeone')}</h2>
              <p className="mt-1 text-sm text-ink-300">
                {profileReady ? t('meetHelp') : t('meetLocked')}
              </p>
            </div>
          </div>
          {profileReady ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/app/world/spin" className="btn-primary">{t('spin')}</Link>
              <Link href="/app/world/map" className="btn-secondary">{t('openMap')}</Link>
              <Link href="/app/world/online" className="btn-secondary">{t('online')}</Link>
            </div>
          ) : (
            <span className="text-sm text-ink-400">{t('afterProfile')}</span>
          )}
        </li>
      </ol>

      {process.env.NODE_ENV !== 'production' && <PracticeTableButton />}
      <WaitingInvites />
      {profile?.inviteCode && <InviteFriend code={profile.inviteCode} />}

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{t('past')}</h3>
          <Link href="/app/conversations" className="text-xs text-brand-300">{t('all')}</Link>
        </div>
        {past.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">{t('noneYet')}</p>
        ) : (
          <PastSitList hours={past} />
        )}
      </div>
    </div>
  );
}
