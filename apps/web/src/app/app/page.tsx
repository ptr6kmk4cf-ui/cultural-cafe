import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { serializeConversation } from '@/lib/services/world';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = (await getCurrentUser())!;
  const [photos, language, profile, cafeRows] = await Promise.all([
    db.photo.count({ where: { userId: user.id } }),
    db.languageSettings.findUnique({ where: { userId: user.id } }),
    db.worldProfile.findUnique({ where: { userId: user.id } }),
    db.worldConversation.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ]);
  const cafeHours = await Promise.all(cafeRows.map((c) => serializeConversation(c, user.id)));
  const steps = [
    { done: !!profile?.city, label: 'Add your city on your café card', href: '/app/world' },
    { done: !!language?.myLanguage, label: 'Choose the language you read', href: '/app/languages' },
    { done: photos > 0, label: 'Optional: add a photo for your card', href: '/app/photos' },
    { done: cafeHours.length > 0, label: 'Sit down and meet someone', href: '/app/world' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Hi {user.name}</h1>
        <p className="text-ink-300">Meet an adult in another country. Write in your language. They read a live translation. Video comes later.</p>
      </div>

      <Link href="/app/world" className="card block transition hover:border-brand-500/40">
        <p className="text-xs uppercase tracking-wide text-brand-300">The Café</p>
        <h2 className="mt-1 text-xl font-bold text-white">Sit down in the Café →</h2>
        <p className="mt-2 text-sm text-ink-300">One hour of text. Both of you accept first. A table topic to start.</p>
      </Link>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold text-white">Getting started</h3>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 text-sm hover:text-white">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${s.done ? 'bg-emerald-500 text-white' : 'border border-white/20'}`}>
                    {s.done && (
                      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                        <path d="M3.5 8.2 6.4 11 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Your café hours</h3>
            <Link href="/app/conversations" className="text-xs text-brand-300">All →</Link>
          </div>
          {cafeHours.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">
              None yet.{' '}
              <Link href="/app/world" className="text-brand-300 hover:underline">Sit down in the Café</Link>
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {cafeHours.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/world/${c.id}`} className="flex items-center justify-between py-2 text-sm hover:text-white">
                    <span>{c.peer?.name ?? 'Someone'}{c.prompt?.title ? ` · ${c.prompt.title}` : ''}</span>
                    <span className="text-xs text-ink-400">{c.status === 'ACTIVE' ? 'in progress' : new Date(c.startedAt).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
