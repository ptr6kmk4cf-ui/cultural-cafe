import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { serializeConversations } from '@/lib/services/world';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = (await getCurrentUser())!;
  const [photos, profile, cafeRows] = await Promise.all([
    db.photo.count({ where: { userId: user.id } }),
    db.worldProfile.findUnique({ where: { userId: user.id } }),
    db.worldConversation.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ]);
  const cafeHours = await serializeConversations(cafeRows, user.id);
  const profileReady = !!profile?.city?.trim() && !!profile.optedIn;
  const past = cafeHours.filter((c) => c.status !== 'ACTIVE');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Hi {user.name}</h1>
        <p className="mt-1 text-ink-300">Save your profile, then meet someone.</p>
      </div>

      <ol className="space-y-3">
        <li className="card flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${profileReady ? 'bg-emerald-500 text-white' : 'bg-brand-500 text-white'}`}>
              {profileReady ? '✓' : '1'}
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Your profile</h2>
              <p className="mt-1 text-sm text-ink-300">
                {profileReady
                  ? `${profile?.city}${profile?.country ? `, ${profile.country}` : ''}. People see this before they sit with you.`
                  : 'Add your city. People see it before they sit with you.'}
              </p>
              <p className="mt-2 text-xs text-ink-400">
                Optional:{' '}
                <Link href="/app/languages" className="text-brand-300 hover:underline">the language you read</Link>
                {' · '}
                <Link href="/app/photos" className="text-brand-300 hover:underline">{photos > 0 ? 'your photo' : 'add a photo'}</Link>
              </p>
            </div>
          </div>
          <Link href="/app/world#profile" className={profileReady ? 'btn-secondary' : 'btn-primary'}>
            {profileReady ? 'Edit your profile' : 'Open your profile'}
          </Link>
        </li>
        <li className={`card flex flex-wrap items-center justify-between gap-4 ${profileReady ? '' : 'opacity-80'}`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${profileReady ? 'bg-brand-500 text-white' : 'border border-white/20 text-ink-300'}`}>2</span>
            <div>
              <h2 className="text-lg font-bold text-white">Meet someone</h2>
              <p className="mt-1 text-sm text-ink-300">
                {profileReady
                  ? 'Spin for a random person, tap a name, or pick a city on the map.'
                  : 'This opens after your profile.'}
              </p>
            </div>
          </div>
          {profileReady ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/app/world/spin" className="btn-primary">Spin at random</Link>
              <Link href="/app/world#meet" className="btn-secondary">Meet someone</Link>
              <Link href="/app/world/map" className="btn-secondary">Open the map</Link>
            </div>
          ) : (
            <span className="text-sm text-ink-400">After your profile</span>
          )}
        </li>
      </ol>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Past contacts</h3>
          <Link href="/app/conversations" className="text-xs text-brand-300">All →</Link>
        </div>
        {past.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">None yet. They show up here after you sit with someone.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {past.map((c) => (
              <li key={c.id}>
                <Link href="/app/conversations" className="flex items-center justify-between py-2 text-sm hover:text-white">
                  <span>{c.peer?.name ?? 'Someone'}{c.prompt?.title ? ` · ${c.prompt.title}` : ''}</span>
                  <span className="text-xs text-ink-400">{new Date(c.startedAt).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
