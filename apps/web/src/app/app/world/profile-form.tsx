'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Field, PageHeader, useToast } from '@/components/ui';
import { api } from '@/lib/client';
import { subscribeCafePoll, type CafePoll } from '@/lib/request-notice';

type Profile = { optedIn: boolean; available: boolean; name: string; city: string; country: string; gender: '' | 'man' | 'woman'; bio: string; portraitPhotoId: string | null };
type Photo = { id: string; url: string; category: string };

export function ProfileForm({ initial }: { initial: Profile }) {
  const { t } = useUi();
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosReady, setPhotosReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, show] = useToast();
  const [form, setForm] = useState<Profile>(initial);
  const arrived = useRef(true);
  const closedOnArrival = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    api<CafePoll>('/api/world/requests')
      .then((poll) => {
        if (stopped || !arrived.current) return;
        arrived.current = false;
        if (poll.conversationId) closedOnArrival.current = poll.conversationId;
      })
      .catch(() => {
        arrived.current = false;
      });
    api<{ photos: Photo[] }>('/api/photos')
      .then((data) => {
        if (stopped) return;
        setPhotos(data.photos.filter((photo) => photo.category !== 'PRIVATE'));
        setPhotosReady(true);
      })
      .catch(() => {
        if (!stopped) setPhotosReady(true);
      });
    function jump() {
      const id = window.location.hash.replace('#', '');
      if (id === 'wheel') window.location.replace('/app/world/spin');
      if (id === 'meet') window.location.replace('/app');
    }
    jump();
    window.addEventListener('hashchange', jump);
    return () => {
      stopped = true;
      window.removeEventListener('hashchange', jump);
    };
  }, []);

  useEffect(() => {
    if (!form.optedIn) return;
    return subscribeCafePoll((poll) => {
      if (arrived.current) return;
      const id = poll.conversationId;
      if (!id || id === closedOnArrival.current) return;
      window.location.href = `/app/world/${id}`;
    });
  }, [form.optedIn]);

  async function saveProfile(extra: Partial<Profile> = {}) {
    setError('');
    setBusy('save');
    try {
      const next = { ...form, ...extra };
      const saved = await api<{ profile: Profile }>('/api/world/profile', { method: 'PUT', body: next });
      setForm(saved.profile);
      show(t('profileSaved'));
      router.refresh();
      setBusy('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
      return false;
    }
  }

  async function onSave() {
    if (!form.name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!form.city.trim()) {
      setError(t('cityRequired'));
      return;
    }
    await saveProfile({ optedIn: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('yourProfile')}
        subtitle={t('profileSub')}
      />
      {error && <Alert kind="error">{error}</Alert>}

      <section className="card space-y-4">
        <Field label={t('yourName')}>
          <input className="input text-base" autoComplete="given-name" enterKeyHint="next" maxLength={60} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div>
          <span className="label">{t('manOrWoman')}</span>
          <div className="mt-2 flex gap-2">
            <button type="button" className={form.gender === 'man' ? 'btn-primary' : 'btn-secondary'} onClick={() => setForm({ ...form, gender: 'man' })}>{t('man')}</button>
            <button type="button" className={form.gender === 'woman' ? 'btn-primary' : 'btn-secondary'} onClick={() => setForm({ ...form, gender: 'woman' })}>{t('woman')}</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('cityLabel')}>
            <input className="input text-base" autoComplete="address-level2" enterKeyHint="next" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lisbon" />
          </Field>
          <Field label={t('countryLabel')}>
            <input className="input text-base" autoComplete="country-name" enterKeyHint="next" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Portugal" />
          </Field>
        </div>
        <Field label={t('aboutYou')} hint={t('aboutHint')}>
          <textarea className="input min-h-20 text-base" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="I like late trains, street food and asking people what they are proud of in their city." />
        </Field>
        <div>
          <span className="label">{t('portrait')}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setForm({ ...form, portraitPhotoId: null })} className={`h-16 w-16 rounded-xl border text-xs ${!form.portraitPhotoId ? 'border-brand-400' : 'border-white/10'}`}>{t('none')}</button>
            {photos.map((p) => (
              <button key={p.id} type="button" onClick={() => setForm({ ...form, portraitPhotoId: p.id })} className={`h-16 w-16 overflow-hidden rounded-xl border ${form.portraitPhotoId === p.id ? 'border-brand-400' : 'border-white/10'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          {photosReady && photos.length === 0 && <p className="mt-1 text-xs text-ink-400"><Link href="/app/photos" className="text-brand-300">{t('uploadPhoto')}</Link> {t('uploadPhotoRest')}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy === 'save'} onClick={onSave}>
            {busy === 'save' ? t('saving') : t('saveProfile')}
          </button>
          {form.optedIn && (
            <button className="btn-secondary" disabled={busy === 'save'} onClick={() => saveProfile({ optedIn: false })}>
              {t('hideProfile')}
            </button>
          )}
        </div>
      </section>
      {toast}
    </div>
  );
}
