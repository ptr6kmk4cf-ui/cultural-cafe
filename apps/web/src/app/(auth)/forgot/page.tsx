'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Field } from '@/components/ui';
import { api } from '@/lib/client';

export default function ForgotPage() {
  const { t } = useUi();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ ok: boolean; devLink?: string }>('/api/auth/forgot', { body: { email } });
      setSent(true);
      setDevLink(data.devLink || '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">{t('checkYourEmail')}</h1>
        <Alert kind="success">{t('resetSent')}</Alert>
        {devLink && (
          <p className="text-sm text-ink-300">
            {t('resetDevHint')}{' '}
            <Link className="text-brand-300 underline" href={devLink}>{t('chooseNewPassword')}</Link>
          </p>
        )}
        <p className="text-center text-sm text-ink-300">
          <Link className="text-brand-300 hover:underline" href="/login">{t('signIn')}</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} autoComplete="on" className="space-y-4">
      <h1 className="text-xl font-bold text-white">{t('forgotTitle')}</h1>
      <p className="text-sm text-ink-300">{t('forgotHelp')}</p>
      {error && <Alert kind="error">{error}</Alert>}
      <Field label={t('email')}>
        <input
          className="input"
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? t('sendingReset') : t('sendReset')}</button>
      <p className="text-center text-sm text-ink-300">
        <Link className="text-brand-300 hover:underline" href="/login">{t('signIn')}</Link>
      </p>
    </form>
  );
}
