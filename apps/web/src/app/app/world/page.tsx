'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, Empty, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';

type Card = {
  id: string;
  name: string;
  age: number;
  city: string;
  country: string;
  bio: string;
  language: string;
  languageLabel: string;
  languages: string[];
  interests: string[];
  portraitUrl: string | null;
  online: boolean;
  available: boolean;
};
type Invite = { id: string; kind: string; incoming: boolean; iAccepted: boolean; theyAccepted: boolean; expiresAt: string; peer: Card | null };
type Profile = { optedIn: boolean; available: boolean; city: string; country: string; bio: string; portraitPhotoId: string | null };
type Photo = { id: string; url: string; category: string };

export default function WorldPage() {
  const [state, setState] = useState<any>(null);
  const [people, setPeople] = useState<Card[] | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [queued, setQueued] = useState(false);
  const [toast, show] = useToast();
  const [form, setForm] = useState<Profile>({ optedIn: false, available: false, city: '', country: '', bio: '', portraitPhotoId: null });

  async function load() {
    const s = await api('/api/world/state');
    setState(s);
    setForm(s.profile);
    if (s.conversation) {
      window.location.href = `/app/world/${s.conversation.id}`;
      return s;
    }
    return s;
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    api('/api/photos').then((d) => setPhotos(d.photos.filter((p: Photo) => p.category !== 'PRIVATE'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      load().then((s) => {
        if (queued && s && !s.invites?.length && !s.conversation) setQueued(true);
      }).catch(() => {});
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued]);

  async function saveProfile(extra: Partial<Profile> = {}) {
    setError('');
    setBusy('save');
    try {
      const next = { ...form, ...extra };
      await api('/api/world/profile', { method: 'PUT', body: next });
      setForm(next);
      await load();
      show('Café card saved');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function meetNow() {
    setError('');
    setBusy('queue');
    try {
      const r = await api('/api/world/queue', { body: { action: 'join' } });
      setQueued(r.state === 'queued');
      if (r.conversation) window.location.href = `/app/world/${r.conversation.id}`;
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function cancelQueue() {
    await api('/api/world/queue', { body: { action: 'leave' } });
    setQueued(false);
    await load();
  }

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    try {
      const r = await api(`/api/world/invites/${id}`, { body: { accept } });
      if (r.conversation) window.location.href = `/app/world/${r.conversation.id}`;
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function browse() {
    setBusy('browse');
    try {
      const r = await api('/api/world/people');
      setPeople(r.people);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function invite(id: string) {
    setBusy(id);
    try {
      await api('/api/world/invite', { body: { toId: id } });
      show('Invitation sent — they still have to accept');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  if (!state) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;
  const invites: Invite[] = state.invites ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Café"
        subtitle="For an hour, become a tourist in someone else’s everyday life. The chat is a direct link between your two browsers. Write in your language — they read yours in theirs."
      />
      {error && <Alert kind="error">{error}</Alert>}
      <p className="text-xs text-ink-400">
        {state.quota.used} / {state.quota.limit} conversations today · both people must accept · chats last one hour · location is what you type, never inferred · AI drafts / run-the-hour are Premium
      </p>

      {invites.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-white">Waiting for both of you to accept</h2>
          {invites.map((i) => (
            <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{i.peer?.name ?? 'Someone'}{i.peer?.city ? ` · ${i.peer.city}` : ''}{i.peer?.country ? `, ${i.peer.country}` : ''}</p>
                <p className="text-xs text-ink-400">
                  {i.kind === 'RANDOM' ? 'Random match' : 'From profile photos'} · they speak {i.peer?.languageLabel}
                  {' · '}you {i.iAccepted ? 'accepted' : 'have not accepted'} · they {i.theyAccepted ? 'accepted' : 'have not accepted'}
                </p>
              </div>
              <div className="flex gap-2">
                {!i.iAccepted && (
                  <button className="btn-primary" disabled={!!busy} onClick={() => respond(i.id, true)}>Accept</button>
                )}
                <button className="btn-secondary" disabled={!!busy} onClick={() => respond(i.id, false)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {queued && invites.length === 0 && (
        <div className="card space-y-3 text-center">
          <p className="font-semibold text-white">Looking for someone in the Café…</p>
          <p className="text-sm text-ink-300">You will both see a card and must accept before anything is said.</p>
          <button className="btn-secondary" onClick={cancelQueue}>Stop looking</button>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold text-white">Your café card</h2>
        <p className="text-xs text-ink-400">Opt in only if you want people in the Café to find you. Portrait is optional and must be a photo you uploaded (never a private one).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City (self-stated)">
            <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lisbon" />
          </Field>
          <Field label="Country (self-stated)">
            <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Portugal" />
          </Field>
        </div>
        <Field label="A few words about you" hint="Shown to people you may meet. Do not include your address, phone or social handles.">
          <textarea className="input min-h-20" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="I like late trains, street food and asking people what they are proud of in their city." />
        </Field>
        <div>
          <span className="label">Portrait (optional)</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setForm({ ...form, portraitPhotoId: null })} className={`h-16 w-16 rounded-xl border text-xs ${!form.portraitPhotoId ? 'border-brand-400' : 'border-white/10'}`}>None</button>
            {photos.map((p) => (
              <button key={p.id} type="button" onClick={() => setForm({ ...form, portraitPhotoId: p.id })} className={`h-16 w-16 overflow-hidden rounded-xl border ${form.portraitPhotoId === p.id ? 'border-brand-400' : 'border-white/10'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          {photos.length === 0 && <p className="mt-1 text-xs text-ink-400"><Link href="/app/photos" className="text-brand-300">Upload a photo</Link> if you want a face on your card.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy === 'save'} onClick={() => saveProfile()}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button>
          <button
            className={form.optedIn ? 'btn-secondary' : 'btn-primary'}
            disabled={busy === 'save'}
            onClick={() => saveProfile({ optedIn: !form.optedIn })}
          >
            {form.optedIn ? 'Leave the Café' : 'Join the Café'}
          </button>
        </div>
      </div>

      {form.optedIn && !queued && invites.length === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <button type="button" className="card text-left transition hover:border-brand-500/40" disabled={!!busy} onClick={meetNow}>
            <p className="text-xs uppercase tracking-wide text-brand-300">Random</p>
            <h2 className="mt-1 text-xl font-bold text-white">Meet someone now →</h2>
            <p className="mt-2 text-sm text-ink-300">We pair you with another person who is free. Both of you still have to accept.</p>
          </button>
          <button type="button" className="card text-left transition hover:border-brand-500/40" disabled={!!busy} onClick={browse}>
            <p className="text-xs uppercase tracking-wide text-brand-300">Choose</p>
            <h2 className="mt-1 text-xl font-bold text-white">Pick from photos →</h2>
            <p className="mt-2 text-sm text-ink-300">Browse people who opted in. Inviting them is your yes; they still have to say yes.</p>
          </button>
        </div>
      )}

      {people && (
        <div className="space-y-3">
          <h2 className="font-semibold text-white">People in the Café</h2>
          {people.length === 0 ? (
            <Empty title="Nobody is in the Café yet">Invite a friend to opt in, or use Meet someone now when another account is looking.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => (
                <article key={p.id} className="card space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white/10 text-lg font-bold text-white">
                      {p.portraitUrl ? <img src={p.portraitUrl} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{p.name} · {p.age}</p>
                      <p className="text-xs text-ink-400">{[p.city, p.country].filter(Boolean).join(', ') || 'Somewhere'} · {p.languageLabel}</p>
                      {p.online && <Badge tone="green">online</Badge>}
                    </div>
                  </div>
                  {p.bio && <p className="text-sm text-ink-200">{p.bio}</p>}
                  {p.interests.length > 0 && <p className="text-xs text-ink-400">{p.interests.slice(0, 5).join(' · ')}</p>}
                  <button className="btn-primary w-full" disabled={!!busy} onClick={() => invite(p.id)}>Invite to talk</button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {toast}
    </div>
  );
}
