'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Field } from '@/components/ui';
import { keepBrowserLogin } from '@/lib/browser-login';
import { api } from '@/lib/client';

export default function LoginPage() {
  const { t } = useUi();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [registerHref, setRegisterHref] = useState('/register');

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next') || '';
    const m = /^\/join\/([a-z2-9]+)$/.exec(next);
    if (m) setRegisterHref(`/register?from=${m[1]}`);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { body: { email, password } });
      await keepBrowserLogin(email, password);
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} autoComplete="on" className="space-y-4">
      <h1 className="text-xl font-bold text-white">{t('welcomeBack')}</h1>
      {error && <Alert kind="error">{error}</Alert>}
      <Field label={t('email')}>
        <input
          className="input"
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={t('password')}>
        <input
          className="input"
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <p className="text-right text-sm">
        <Link className="text-brand-300 hover:underline" href="/forgot">{t('forgotPassword')}</Link>
      </p>
      <button className="btn-primary w-full" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button>
      <p className="text-center text-sm text-ink-300">
        {t('newHere')} <Link className="text-brand-300 hover:underline" href={registerHref}>{t('createAccount')}</Link>
      </p>
    </form>
  );
}
