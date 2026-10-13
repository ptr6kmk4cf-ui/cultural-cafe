'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Field } from '@/components/ui';
import { api } from '@/lib/client';

export default function RegisterPage() {
  const { t } = useUi();
  const [f, setF] = useState({ name: '', email: '', password: '', birthDate: '', confirmAdult: false, acceptTerms: false });
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from') || sessionStorage.getItem('cafe_invite') || '';
    if (from) {
      sessionStorage.setItem('cafe_invite', from);
      setInviteCode(from);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/register', { body: { ...f, inviteCode: inviteCode || undefined } });
      window.location.href = inviteCode ? '/app/world?from=friend' : '/app?welcome=1';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-bold text-white">{t('createYourAccount')}</h1>
      {inviteCode && <Alert kind="info">{t('friendInvited')}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <Field label={t('firstName')}>
        <input className="input" required maxLength={60} value={f.name} onChange={set('name')} />
      </Field>
      <Field label={t('email')}>
        <input className="input" type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
      </Field>
      <Field label={t('password')} hint={t('passwordHint')}>
        <input className="input" type="password" autoComplete="new-password" minLength={10} required value={f.password} onChange={set('password')} />
      </Field>
      <Field label={t('birthDate')} hint={t('birthHint')}>
        <input className="input" type="date" required value={f.birthDate} onChange={set('birthDate')} />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-200">
        <input type="checkbox" className="mt-1" checked={f.confirmAdult} onChange={set('confirmAdult')} required />
        {t('confirmAdult')}
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-200">
        <input type="checkbox" className="mt-1" checked={f.acceptTerms} onChange={set('acceptTerms')} required />
        <span>
          {t('acceptThe')} <Link className="text-brand-300 underline" href="/legal/terms" target="_blank">{t('terms')}</Link> {t('andWord')}{' '}
          <Link className="text-brand-300 underline" href="/legal/privacy" target="_blank">{t('privacyPolicy')}</Link>{t('respect')}
        </span>
      </label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? t('creating') : t('createAccount')}</button>
      <p className="text-center text-sm text-ink-300">
        {t('alreadyRegistered')} <Link className="text-brand-300 hover:underline" href="/login">{t('signIn')}</Link>
      </p>
    </form>
  );
}
