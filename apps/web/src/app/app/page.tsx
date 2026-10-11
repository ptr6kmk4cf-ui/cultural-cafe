import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { PLAN_LIMITS } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = (await getCurrentUser())!;
  const day = new Date(Date.now() - 86400_000);
  const [contacts, shortlist, aiToday, photos, personality, ext, recent, ap] = await Promise.all([
    db.contact.count({ where: { userId: user.id, status: 'ACTIVE' } }),
    db.matchCandidate.count({ where: { userId: user.id, status: 'SHORTLISTED' } }),
    db.aiUsage.count({ where: { userId: user.id, createdAt: { gte: day } } }),
    db.photo.count({ where: { userId: user.id } }),
    db.personalityProfile.findUnique({ where: { userId: user.id } }),
    db.session.count({ where: { userId: user.id, kind: 'EXTENSION', expiresAt: { gt: new Date() } } }),
    db.contact.findMany({ where: { userId: user.id, status: 'ACTIVE' }, orderBy: { lastActivityAt: 'desc' }, take: 5 }),
    db.autopilotSettings.findUnique({ where: { userId: user.id } }),
  ]);
  const limits = PLAN_LIMITS[user.plan];
  const steps = [
    { done: !!personality && (decrypt(personality.aboutMe).length > 10 || personality.interests.length > 0), label: 'Say a little about yourself so drafts never invent you', href: '/app/personality' },
    { done: photos > 0, label: 'Add a photo you are happy to show on your café card', href: '/app/photos' },
    { done: true, label: 'Sit down in the Café and meet someone from another place', href: '/app/world' },
    { done: ext > 0, label: 'Optional: connect the dating-site assistant', href: '/app/extension' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Hi {user.name}</h1>
        <p className="text-ink-300">The Café is open. Dating tools are still here if you want them.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/app/world" className="card group transition hover:border-brand-500/40 md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-brand-300">The Café</p>
          <h2 className="mt-1 text-xl font-bold text-white">Meet someone from another place →</h2>
          <p className="mt-2 text-sm text-ink-300">A one-hour conversation. You write in your language; they read it in theirs. Both of you accept before anything is said.</p>
        </Link>
        <Link href="/app/matches" className="card group transition hover:border-brand-500/40">
          <p className="text-xs uppercase tracking-wide text-brand-300">Assistant</p>
          <h2 className="mt-1 text-xl font-bold text-white">Find matches →</h2>
          <p className="mt-2 text-sm text-ink-300">Screen profiles on a supported site against your preferences, get a shortlist with reasons, and personalised openers.</p>
        </Link>
        <Link href="/app/contacts/new" className="card group transition hover:border-brand-500/40">
          <p className="text-xs uppercase tracking-wide text-brand-300">Assistant</p>
          <h2 className="mt-1 text-xl font-bold text-white">Chat with someone →</h2>
          <p className="mt-2 text-sm text-ink-300">Add someone you are already talking to. Get openers, replies, translation and memory — you still press send.</p>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Active contacts" value={`${contacts}`} sub={`of ${limits.maxActiveContacts}`} />
        <Stat label="Shortlisted" value={`${shortlist}`} sub="awaiting first message" />
        <Stat label="AI requests (24h)" value={`${aiToday}`} sub={`of ${limits.aiRequestsPerDay}`} />
        <Stat label="Autopilot" value={ap?.emergencyStop ? 'Stopped' : ap?.enabled ? 'On' : 'Off'} sub="local demo only" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold text-white">Getting started</h3>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 text-sm hover:text-white">
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${s.done && s.href !== '/app/world' ? 'bg-emerald-500 text-white' : 'border border-white/20'}`}>{s.done && s.href !== '/app/world' ? '✓' : ''}</span>
                  <span className={s.done && s.href !== '/app/world' ? 'text-ink-400 line-through' : ''}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Recent conversations</h3>
            <Link href="/app/conversations" className="text-xs text-brand-300">All →</Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">No conversations yet. The Café is the fastest way to start one.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/conversations/${c.id}`} className="flex items-center justify-between py-2 text-sm hover:text-white">
                    <span>{c.name}</span>
                    <span className="text-xs text-ink-400">{c.doNotContact ? 'do not contact' : c.lastActivityAt.toLocaleDateString()}</span>
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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-ink-400">{sub}</p>
    </div>
  );
}
