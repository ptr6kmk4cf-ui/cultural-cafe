'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CAFE_PROMPTS } from '@conversa/shared';
import { InviteFriend } from '@/components/InviteFriend';
import { Alert, Field, PageHeader, Spinner, useToast } from '@/components/ui';
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
    api('/api/photos').then((d) => setPhotos(d.photos.filter((p: Photo) => p.category !== 'PRIVATE'))).catch(() => {});
    function jump() {
      const id = window.location.hash.replace('#', '');
      if (id === 'wheel') {
        window.location.replace('/app/world/spin');
        return;
      }
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

  if (!state) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;
  const showFriendHint = fromFriend && !form.optedIn && !invites.some((i) => i.kind === 'FRIEND');
  const profileReady = !!form.city.trim() && form.optedIn;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Café"
        subtitle="Save your profile. Then spin, or pick a city. A table is timed."
      />
      {error && <Alert kind="error">{error}</Alert>}
      {showFriendHint && (
        <Alert kind="info">A friend invited you. Save your profile first. You both still accept.</Alert>
      )}

      <section id="profile" className="card scroll-mt-24 space-y-4">
        <h2 className="font-semibold text-white">Your profile</h2>
        <p className="text-sm text-ink-300">People see your name, city, and these words. A photo is optional.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City">
            <input className="input text-base" autoComplete="address-level2" enterKeyHint="next" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lisbon" />
          </Field>
          <Field label="Country">
            <input className="input text-base" autoComplete="country-name" enterKeyHint="next" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Portugal" />
          </Field>
        </div>
        <Field label="A few words about you" hint="Leave out your address, phone, and social handles.">
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
          <h2 className="text-xl font-bold text-white">Meet someone</h2>
          <p className="mt-1 text-sm text-ink-300">
            A guest sits right away. Someone else has to say yes.{' '}
            <Link href="/app/world/spin" className="text-brand-300 hover:underline">Spin at random</Link>
            {' or '}
            <Link href="/app/world/map" className="text-brand-300 hover:underline">pick a city</Link>.
          </p>
        </div>
        {!profileReady && <Alert kind="info">Add your city and tap Save profile.</Alert>}
        {invites.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-white">Still waiting</h3>
            {invites.map((i) => (
              <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{i.peer?.name ?? 'Someone'}{i.peer?.city ? ` · ${i.peer.city}` : ''}</p>
                  <p className="text-sm text-ink-300">
                    {i.iAccepted
                      ? 'You said yes. The table starts when they say yes.'
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
        <p className="text-sm text-ink-300">A table starts with one of these questions.</p>
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
        <p className="mt-2 text-xs text-ink-400">A topic you add is used on a later table. Leave out names and phone numbers.</p>
      </div>

      {state.profile?.inviteCode && <InviteFriend code={state.profile.inviteCode} />}
      {toast}
    </div>
  );
}
