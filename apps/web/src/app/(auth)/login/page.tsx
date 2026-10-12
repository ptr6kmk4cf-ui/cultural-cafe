'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { api } from '@/lib/client';

export default function LoginPage() {
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
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-bold text-white">Welcome back</h1>
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="Email">
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-center text-sm text-ink-300">
        New here? <Link className="text-brand-300 hover:underline" href={registerHref}>Create an account</Link>
      </p>
    </form>
  );
}
