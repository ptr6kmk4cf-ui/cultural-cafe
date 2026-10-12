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
  const [queued, setQueued] = useState(false);
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
  const waiting = queued || invites.length > 0;
  const watching = waiting || form.optedIn;

  useEffect(() => {
    if (!watching) return;
    const t = setInterval(() => {
      load().then((s) => {
        if (s?.invites?.length || s?.conversation) setQueued(false);
      }).catch(() => {});
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

  async function invite(id: string) {
    setBusy(id);
    try {
      const r = await api<{ conversation?: { id: string } | null }>('/api/world/invite', { body: { toId: id } });
      if (r.conversation?.id) {
        window.location.href = `/app/world/${r.conversation.id}`;
        return;
      }
      show('Invitation sent — they still have to accept');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  if (!state) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;
  const showFriendHint = fromFriend && !form.optedIn && !invites.some((i) => i.kind === 'FRIEND');
  const profileReady = !!form.city.trim() && form.optedIn;

  function blockedUntilProfile() {
    if (profileReady) return false;
    setError('Save your profile first. Add your city, then tap Save and meet someone.');
    showStep('profile');
    return true;
  }

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
            <span className="block text-xs text-ink-400">{profileReady ? 'Choose how' : 'After your profile'}</span>
          </span>
        </a>
      </nav>
      {error && <Alert kind="error">{error}</Alert>}
      {showFriendHint && (
        <Alert kind="info">A friend invited you. Save your profile first. You will both still accept before the table starts.</Alert>
      )}
      <p className="text-xs text-ink-400">
        {state.quota.used} / {state.quota.limit} tables today · both people must accept · the table is timed · location is what you type
      </p>

      {invites.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-white">Waiting for both of you to accept</h2>
          {invites.map((i) => (
            <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{i.peer?.name ?? 'Someone'}{i.peer?.city ? ` · ${i.peer.city}` : ''}{i.peer?.country ? `, ${i.peer.country}` : ''}</p>
                <p className="text-xs text-ink-400">
                  {i.kind === 'FRIEND' ? (i.incoming ? 'A friend invited you' : 'You invited a friend') : i.kind === 'RANDOM' ? 'Random match' : 'From profile photos'} · they speak {i.peer?.languageLabel}
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
          <h2 className="mt-1 text-xl font-bold text-white">Meet someone new</h2>
          <p className="mt-1 text-sm text-ink-300">Pick one of these. Someone you already know is a separate choice, further down.</p>
        </div>
        {!profileReady && <Alert kind="info">Add your city and tap Save profile. Then use one of these.</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          {queued ? (
            <div className="card space-y-3">
              <p className="text-xs uppercase tracking-wide text-brand-300">Now</p>
              <h3 className="text-xl font-bold text-white">Looking for someone…</h3>
              <p className="text-sm text-ink-300">You will both see a card and must accept before anything is said.</p>
              <button className="btn-secondary" onClick={cancelQueue}>Stop looking</button>
            </div>
          ) : (
            <button
              type="button"
              className="card text-left transition hover:border-brand-500/40"
              disabled={!!busy}
              onClick={() => { if (!blockedUntilProfile()) meetNow(); }}
            >
              <p className="text-xs uppercase tracking-wide text-brand-300">Now</p>
              <h3 className="mt-1 text-xl font-bold text-white">Meet someone now</h3>
              <p className="mt-2 text-sm text-ink-300">We find a person who is free. You both still accept before anything is said.</p>
            </button>
          )}
          <button
            type="button"
            className="card text-left transition hover:border-brand-500/40"
            disabled={!!busy}
            onClick={() => { if (!blockedUntilProfile()) browse(); }}
          >
            <p className="text-xs uppercase tracking-wide text-brand-300">Choose</p>
            <h3 className="mt-1 text-xl font-bold text-white">Open a profile</h3>
            <p className="mt-2 text-sm text-ink-300">See who is here. A café guest can sit down right away. A person still has to say yes.</p>
          </button>
        </div>

      {people && (
        <div className="space-y-3">
          <h2 className="font-semibold text-white">Profiles</h2>
          {people.some((p) => p.guest) && (
            <p className="text-xs text-ink-400">Café guests keep a few tables open until more people join. They are marked Guest, and they leave as the room fills up. Anyone you already met is in Past contacts, not here.</p>
          )}
          {people.length === 0 ? (
            <Empty title="Nobody to meet yet">Use Meet someone now, or the link for someone you already know.</Empty>
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
                      <span className="mt-1 flex flex-wrap gap-1">
                        {p.guest && <Badge>Guest</Badge>}
                        {p.online && !p.guest && <Badge tone="green">online</Badge>}
                      </span>
                    </div>
                  </div>
                  {p.bio && <p className="text-sm text-ink-200">{p.bio}</p>}
                  {p.interests.length > 0 && <p className="text-xs text-ink-400">{p.interests.slice(0, 5).join(' · ')}</p>}
                  <button className="btn-primary w-full" disabled={!!busy} onClick={() => invite(p.id)}>{p.guest ? 'Meet' : 'Ask to meet'}</button>
                </article>
              ))}
            </div>
          )}
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
