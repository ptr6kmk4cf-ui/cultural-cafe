import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BrandMark } from '@/components/BrandMark';
import { getCurrentUser } from '@/lib/auth';
import { HttpError } from '@/lib/http';
import { claimFriendInvite, isInviteCode, lookupFriendInvite } from '@/lib/services/world';

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

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <BrandMark />
      <div className="card mt-8 space-y-4">
        <p className="text-xs uppercase tracking-wide text-brand-300">A friend invited you</p>
        <h1 className="text-2xl font-bold text-white">
          {host.name}
          {place ? ` in ${place}` : ''} wants to sit with you in the Café
        </h1>
        <p className="text-sm text-ink-300">
          Take a table with someone in another country. You write in your own language. They read a live translation. Both of you still have to accept before anything is said. Adults 18+ only. This is not dating.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={registerHref} className="btn-primary">Create an account</Link>
          <Link href={loginHref} className="btn-secondary">I have an account</Link>
        </div>
      </div>
    </main>
  );
}
