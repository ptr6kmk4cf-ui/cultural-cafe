'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

const PLANS = [
  { id: 'FREE', name: 'Free', price: '€0', features: ['Sit down whenever you want', 'Live translation', 'Draft a reply, or let Cultural Café answer at the table'] },
  { id: 'PREMIUM', name: 'Premium', price: '€14.99 / month', features: ['Sit down whenever you want', 'Live translation', 'Draft a reply, or let Cultural Café answer at the table', 'Video later'] },
];

export default function Subscription() {
  const [me, setMe] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setStatus(new URLSearchParams(window.location.search).get('status'));
    api('/api/me').then(setMe);
    api('/api/usage').then(setUsage);
  }, []);
  if (!me) return <Spinner />;

  async function go(path: string) {
    setError('');
    try {
      const { url } = await api(path, { method: 'POST' });
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Plan" subtitle="More tables when you need them. Video comes later." />
      {status === 'success' && <Alert kind="success">Thanks! Your plan updates as soon as Stripe confirms the payment.</Alert>}
      {error && <Alert kind="warning">{error}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => (
          <div key={p.id} className={`card space-y-3 ${me.user.plan === p.id ? 'border-brand-500/50' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">{p.name}</h2>
              {me.user.plan === p.id && <Badge tone="brand">Current plan</Badge>}
            </div>
            <p className="text-2xl font-bold text-white">{p.price}</p>
            <ul className="space-y-1 text-sm">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
            {p.id === 'PREMIUM' && me.user.plan !== 'PREMIUM' && <button className="btn-primary w-full" onClick={() => go('/api/billing/checkout')}>Upgrade to Premium</button>}
            {p.id === 'PREMIUM' && me.user.plan === 'PREMIUM' && <button className="btn-secondary w-full" onClick={() => go('/api/billing/portal')}>Manage billing</button>}
          </div>
        ))}
      </div>
      {usage && (
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold text-white">AI usage</h2>
          <p>Last 24h: <b className="text-white">{usage.last24h}</b> {usage.limit24h ? `/ ${usage.limit24h}` : '(no daily limit)'} requests</p>
          {usage.limit24h ? (
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-brand-500 to-amber-600" style={{ width: `${Math.min(100, (usage.last24h / usage.limit24h) * 100)}%` }} />
            </div>
          ) : null}
          <p className="text-xs text-ink-400">
            Last 30 days: {usage.last30d.map((f: { feature: string; count: number }) => `${f.feature} ${f.count}`).join(' · ') || 'none'} · tokens in/out {usage.tokens30d.input}/{usage.tokens30d.output}
          </p>
        </div>
      )}
    </div>
  );
}
