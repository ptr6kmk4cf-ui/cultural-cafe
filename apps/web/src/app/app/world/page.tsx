'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CAFE_PROMPTS } from '@conversa/shared';
import { InviteFriend } from '@/components/InviteFriend';
import { Alert, Badge, Empty, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';
import { forgetDeviceLines } from '@/lib/cafe-device';

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
  guest?: boolean;
};
type Invite = { id: string; kind: string; incoming: boolean; iAccepted: boolean; theyAccepted: boolean; expiresAt: string; peer: Card | null };
type Profile = { optedIn: boolean; available: boolean; city: string; country: string; bio: string; portraitPhotoId: string | null; inviteCode?: string | null };
type Photo = { id: string; url: string; category: string };
type CafeState = { profile: Profile; invites: Invite[]; conversation: { id: string } | null; quota: { used: number; limit: number } };

export default function WorldPage() {
  const [state, setState] = useState<CafeState | null>(null);
  const [people, setPeople] = useState<Card[] | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, show] = useToast();
  const [form, setForm] = useState<Profile>({ optedIn: false, available: false, city: '', country: '', bio: '', portraitPhotoId: null });
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [topicText, setTopicText] = useState('');
  const [fromFriend, setFromFriend] = useState(false);
  const arrived = useRef(true);

  async function load(syncForm = false) {
    let s = await api<CafeState>('/api/world/state');
    if (arrived.current && s.conversation) {
      forgetDeviceLines(s.conversation.id);
      await api(`/api/world/conversations/${s.conversation.id}/end`, { body: {} }).catch(() => {});
      s = { ...s, conversation: null };
    }
    arrived.current = false;
    setState(s);
    if (syncForm) setForm(s.profile);
    if (s.conversation) {
      window.location.href = `/app/world/${s.conversation.id}`;
      return s;
    }
    return s;
  }

  useEffect(() => {
    setFromFriend(new URLSearchParams(window.location.search).get('from') === 'friend');
    load(true).catch((e) => setError(e.message));
    api<{ people: Card[] }>('/api/world/people').then((d) => setPeople(d.people)).catch(() => {});
    api('/api/photos').then((d) => setPhotos(d.photos.filter((p: Photo) => p.category !== 'PRIVATE'))).catch(() => {});
    function jump() {
      const id = window.location.hash.replace('#', '');
      if (id === 'profile' || id === 'meet') {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
    window.addEventListener('hashchange', jump);
    const t = window.setTimeout(jump, 400);
    return () => {
      window.removeEventListener('hashchange', jump);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invites = state?.invites ?? [];
  const waiting = invites.length > 0;
  const watching = waiting || form.optedIn;

  useEffect(() => {
    if (!watching) return;
    const t = setInterval(() => {
      load().catch(() => {});
    }, waiting ? 2500 : 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, waiting]);

  function showStep(id: 'profile' | 'meet') {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    history.replaceState(null, '', `#${id}`);
  }

  async function saveProfile(extra: Partial<Profile> = {}) {
    setError('');
    setBusy('save');
    try {
      const next = { ...form, ...extra };
      await api('/api/world/profile', { method: 'PUT', body: next });
      setForm(next);
      await load(true);
      show('Profile saved');
      setBusy('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
      return false;
    }
  }

  async function saveAndMeet() {
    if (!form.city.trim()) {
      setError('Add your city. That is what people see on your profile.');
      showStep('profile');
      return;
    }
    const ok = await saveProfile({ optedIn: true });
    if (ok) showStep('meet');
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

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    const text = topicText.trim();
    if (!text) return;
    setError('');
    setBusy('topic');
    try {
      await api('/api/world/topics', { body: { text } });
      setTopicText('');
      show('Saved for a later table. It stays off this list.');
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  }

  async function invite(person: Card) {
    setError('');
    setBusy(person.id);
    try {
      const r = await api<{ conversation?: { id: string } | null }>('/api/world/invite', { body: { toId: person.id } });
      if (r.conversation?.id) {
        window.location.href = `/app/world/${r.conversation.id}`;
        return;
      }
      setError(`${person.name} still has to accept. The table has not started. Tap a guest to sit down now.`);
      document.getElementById('meet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await load();
    } catch (e) {
      setError((e as Error).message);
      document.getElementById('meet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setBusy('');
  }

  if (!state) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;
  const showFriendHint = fromFriend && !form.optedIn && !invites.some((i) => i.kind === 'FRIEND');
  const profileReady = !!form.city.trim() && form.optedIn;
  const guests = (people ?? []).filter((p) => p.guest);
  const others = (people ?? []).filter((p) => !p.guest);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Café"
        subtitle="Step 1 is your profile. Step 2 is where you meet someone."
      />
      <nav className="grid gap-2 sm:grid-cols-2" aria-label="Steps">
        <a href="#profile" className="card flex items-center gap-3 py-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${profileReady ? 'bg-emerald-500 text-white' : 'bg-brand-500 text-white'}`}>{profileReady ? '✓' : '1'}</span>
          <span>
            <span className="block text-sm font-semibold text-white">Your profile</span>
            <span className="block text-xs text-ink-400">{profileReady ? 'Saved' : 'Add your city'}</span>
          </span>
        </a>
        <a href="#meet" className="card flex items-center gap-3 py-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${profileReady ? 'bg-brand-500 text-white' : 'border border-white/20 text-ink-300'}`}>2</span>
          <span>
            <span className="block text-sm font-semibold text-white">Meet someone</span>
            <span className="block text-xs text-ink-400">{profileReady ? 'Tap a name' : 'After your profile'}</span>
          </span>
        </a>
      </nav>
      {error && <Alert kind="error">{error}</Alert>}
      {showFriendHint && (
        <Alert kind="info">A friend invited you. Save your profile first. You will both still accept before the table starts.</Alert>
      )}
      <p className="text-xs text-ink-400">
        The table is timed · location is what you type
      </p>


      <section id="profile" className="card scroll-mt-24 space-y-4">
        <p className="text-xs uppercase tracking-wide text-brand-300">Step 1</p>
        <h2 className="font-semibold text-white">Your profile</h2>
        <p className="text-sm text-ink-300">People see your first name, city, and these words before they sit with you. A photo is optional.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City (self-stated)">
            <input className="input text-base" autoComplete="address-level2" enterKeyHint="next" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lisbon" />
          </Field>
          <Field label="Country (self-stated)">
            <input className="input text-base" autoComplete="country-name" enterKeyHint="next" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Portugal" />
          </Field>
        </div>
        <Field label="A few words about you" hint="Shown to people you may meet. Do not include your address, phone or social handles.">
          <textarea className="input min-h-20 text-base" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="I like late trains, street food and asking people what they are proud of in their city." />
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
          <button className="btn-primary" disabled={busy === 'save'} onClick={saveAndMeet}>
            {busy === 'save' ? 'Saving…' : 'Save profile'}
          </button>
          {form.optedIn && (
            <button className="btn-secondary" disabled={busy === 'save'} onClick={() => saveProfile({ optedIn: false })}>
              Hide my profile
            </button>
          )}
        </div>
      </section>

      <section id="meet" className="scroll-mt-24 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-300">Step 2</p>
          <h2 className="mt-1 text-xl font-bold text-white">Tap a name to sit down</h2>
          <p className="mt-1 text-sm text-ink-300">
            A guest opens the table right away. Someone else still has to say yes.{' '}
            <Link href="/app/world/map" className="text-brand-300 hover:underline">Or pick a country on the map.</Link>
          </p>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        {!profileReady && <Alert kind="info">Add your city and tap Save profile. The names show up here after that.</Alert>}
        {profileReady && !people && <Spinner />}
        {profileReady && people && guests.length === 0 && others.length === 0 && (
          <Empty title="Nobody to meet yet">Use the link further down for someone you already know.</Empty>
        )}
        {profileReady && guests.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-white">Here now</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {guests.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="card space-y-2 text-left transition hover:border-brand-500/40"
                  disabled={!!busy}
                  onClick={() => invite(p)}
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white/10 text-lg font-bold text-white">
                      {p.portraitUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.portraitUrl} alt="" className="h-full w-full object-cover" />
                      ) : p.name.slice(0, 1)}
                    </span>
                    <span>
                      <span className="block text-lg font-semibold text-white underline decoration-white/30 underline-offset-4">{p.name}</span>
                      <span className="block text-xs text-ink-400">{[p.city, p.country].filter(Boolean).join(', ')} · {p.languageLabel}</span>
                      <span className="mt-1 inline-flex"><Badge>Guest</Badge></span>
                    </span>
                  </span>
                  {p.bio && <span className="block text-sm text-ink-200">{p.bio}</span>}
                  <span className="btn-primary w-full">{busy === p.id ? 'Opening the table…' : `Sit with ${p.name}`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {profileReady && others.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-white">They have to say yes</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="card space-y-2 text-left transition hover:border-brand-500/40"
                  disabled={!!busy}
                  onClick={() => invite(p)}
                >
                  <span className="block text-lg font-semibold text-white underline decoration-white/30 underline-offset-4">{p.name}</span>
                  <span className="block text-xs text-ink-400">{[p.city, p.country].filter(Boolean).join(', ') || 'Somewhere'} · {p.languageLabel}</span>
                  {p.bio && <span className="block text-sm text-ink-200">{p.bio}</span>}
                  <span className="btn-secondary w-full">{busy === p.id ? 'Asking…' : `Ask ${p.name}`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {invites.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-white">Still waiting</h3>
            {invites.map((i) => (
              <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{i.peer?.name ?? 'Someone'}{i.peer?.city ? ` · ${i.peer.city}` : ''}</p>
                  <p className="text-sm text-ink-300">
                    {i.iAccepted
                      ? 'You said yes. The table starts when they say yes. Until then, sit with a guest above.'
                      : 'Tap Accept to sit down, or Decline to skip them.'}
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
      </section>

      <div className="card">
        <p className="text-xs uppercase tracking-wide text-brand-300">Table topics</p>
        <p className="mt-1 text-sm text-ink-300">Each table gets one of these when you both sit down. A starting question, not a script.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CAFE_PROMPTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${openTopic === p.id ? 'border-brand-400 bg-brand-500/20 text-white' : ''}`}
              onClick={() => setOpenTopic(openTopic === p.id ? null : p.id)}
            >
              {p.title}
            </button>
          ))}
        </div>
        {openTopic && (
          <p className="mt-3 text-sm text-ink-100">{CAFE_PROMPTS.find((p) => p.id === openTopic)?.question}</p>
        )}
        <form onSubmit={addTopic} className="mt-4 flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1 text-base"
            maxLength={80}
            value={topicText}
            onChange={(e) => setTopicText(e.target.value)}
            placeholder="Another topic"
            aria-label="Another topic"
          />
          <button className="btn-secondary" disabled={busy === 'topic' || !topicText.trim()}>
            {busy === 'topic' ? 'Saving…' : 'Add'}
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-400">Saved for a later table. It is not added to this list. Leave out names, links, and phone numbers.</p>
      </div>

      {state.profile?.inviteCode && <InviteFriend code={state.profile.inviteCode} />}
      {toast}
    </div>
  );
}
