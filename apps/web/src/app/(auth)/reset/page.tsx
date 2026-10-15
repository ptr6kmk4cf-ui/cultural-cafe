'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Field, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

export default function ResetPage() {
  const { t } = useUi();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('passwordsDiffer'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/reset', { body: { token, password } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (token === null) return <Spinner />;

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">{t('chooseNewPassword')}</h1>
        <Alert kind="error">{t('resetMissing')}</Alert>
        <p className="text-center text-sm text-ink-300">
          <Link className="text-brand-300 hover:underline" href="/forgot">{t('forgotPassword')}</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">{t('passwordUpdated')}</h1>
        <Alert kind="success">{t('passwordUpdatedHelp')}</Alert>
        <Link className="btn-primary block w-full text-center" href="/login">{t('signIn')}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} autoComplete="on" className="space-y-4">
      <h1 className="text-xl font-bold text-white">{t('chooseNewPassword')}</h1>
      {error && <Alert kind="error">{error}</Alert>}
      <Field label={t('newPassword')} hint={t('passwordHint')}>
        <input
          className="input"
          id="reset-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label={t('confirmPassword')}>
        <input
          className="input"
          id="reset-confirm"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? t('savingPassword') : t('savePassword')}</button>
    </form>
  );
}
