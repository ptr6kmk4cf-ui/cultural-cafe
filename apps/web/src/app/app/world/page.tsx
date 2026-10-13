'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Alert, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';
import { forgetDeviceLines } from '@/lib/cafe-device';

type Profile = { optedIn: boolean; available: boolean; city: string; country: string; bio: string; portraitPhotoId: string | null };
type Photo = { id: string; url: string; category: string };
type CafeState = { profile: Profile; conversation: { id: string } | null };

export default function WorldPage() {
  const [state, setState] = useState<CafeState | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, show] = useToast();
  const [form, setForm] = useState<Profile>({ optedIn: false, available: false, city: '', country: '', bio: '', portraitPhotoId: null });
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
    load(true).catch((e) => setError(e.message));
    api('/api/photos').then((d) => setPhotos(d.photos.filter((p: Photo) => p.category !== 'PRIVATE'))).catch(() => {});
    function jump() {
      const id = window.location.hash.replace('#', '');
      if (id === 'wheel') window.location.replace('/app/world/spin');
      if (id === 'meet') window.location.replace('/app');
    }
    jump();
    window.addEventListener('hashchange', jump);
    return () => window.removeEventListener('hashchange', jump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.optedIn) return;
    const t = setInterval(() => {
      load().catch(() => {});
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.optedIn]);

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

  async function onSave() {
    if (!form.city.trim()) {
      setError('Add your city. That is what people see on your profile.');
      return;
    }
    await saveProfile({ optedIn: true });
  }

  if (!state) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your profile"
        subtitle="People see your name, city, and these words. A photo is optional."
      />
      {error && <Alert kind="error">{error}</Alert>}

      <section className="card space-y-4">
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
          <button className="btn-primary" disabled={busy === 'save'} onClick={onSave}>
            {busy === 'save' ? 'Saving…' : 'Save profile'}
          </button>
          {form.optedIn && (
            <button className="btn-secondary" disabled={busy === 'save'} onClick={() => saveProfile({ optedIn: false })}>
              Hide my profile
            </button>
          )}
        </div>
      </section>
      {toast}
    </div>
  );
}
