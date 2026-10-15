'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Field } from '@/components/ui';
import { daysInMonth, isoBirthDate } from '@/lib/birth-date';
import { keepBrowserLogin } from '@/lib/browser-login';
import { api } from '@/lib/client';

const now = new Date();
const MAX_YEAR = now.getFullYear() - 18;
const YEARS = Array.from({ length: MAX_YEAR - 1919 }, (_, i) => MAX_YEAR - i);

export default function RegisterPage() {
  const { t, lang } = useUi();
  const [f, setF] = useState({
    name: '',
    email: '',
    password: '',
    day: '',
    month: '',
    year: '',
    confirmAdult: false,
    acceptTerms: false,
  });
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    const next = { ...f, [k]: value };
    if (k === 'month' || k === 'year') {
      const y = Number(k === 'year' ? value : next.year);
      const m = Number(k === 'month' ? value : next.month);
      const d = Number(next.day);
      if (d && m && d > daysInMonth(y, m)) next.day = '';
    }
    setF(next);
  };

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2000, i, 1)),
      ),
    [lang],
  );
  const year = Number(f.year) || 0;
  const month = Number(f.month) || 0;
  const lastDay = daysInMonth(year, month);
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from') || sessionStorage.getItem('cafe_invite') || '';
    if (from) {
      sessionStorage.setItem('cafe_invite', from);
      setInviteCode(from);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const birthDate = isoBirthDate(Number(f.year), Number(f.month), Number(f.day));
    if (!birthDate) {
      setError(t('birthInvalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/register', {
        body: {
          name: f.name,
          email: f.email,
          password: f.password,
          birthDate,
          confirmAdult: f.confirmAdult,
          acceptTerms: f.acceptTerms,
          inviteCode: inviteCode || undefined,
        },
      });
      await keepBrowserLogin(f.email, f.password, f.name);
      window.location.href = inviteCode ? '/app/world?from=friend' : '/app?welcome=1';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} autoComplete="on" className="space-y-4">
      <h1 className="text-xl font-bold text-white">{t('createYourAccount')}</h1>
      {inviteCode && <Alert kind="info">{t('friendInvited')}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <Field label={t('firstName')}>
        <input className="input" id="signup-name" name="name" autoComplete="given-name" required maxLength={60} value={f.name} onChange={set('name')} />
      </Field>
      <Field label={t('email')}>
        <input className="input" id="signup-email" name="email" type="email" autoComplete="username" required value={f.email} onChange={set('email')} />
      </Field>
      <Field label={t('password')} hint={t('passwordHint')}>
        <input className="input" id="signup-password" name="password" type="password" autoComplete="new-password" minLength={10} required value={f.password} onChange={set('password')} />
      </Field>
      <Field label={t('birthDate')} hint={t('birthHint')}>
        <div className="grid grid-cols-3 gap-2">
          <select className="input" id="signup-day" name="bday-day" autoComplete="bday-day" required aria-label={t('day')} value={f.day} onChange={set('day')}>
            <option value="">{t('day')}</option>
            {days.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
          <select className="input" id="signup-month" name="bday-month" autoComplete="bday-month" required aria-label={t('month')} value={f.month} onChange={set('month')}>
            <option value="">{t('month')}</option>
            {months.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
          <select className="input" id="signup-year" name="bday-year" autoComplete="bday-year" required aria-label={t('year')} value={f.year} onChange={set('year')}>
            <option value="">{t('year')}</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
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
