'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

export default function Admin() {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const load = () => api('/api/admin/stats').then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!d) return <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" subtitle="Aggregate metrics only — admins cannot read users' conversations, memories or photos." />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          ['Users', d.users],
          ['Premium', d.premium],
          ['New (30d)', d.newUsers30d],
          ['AI requests (24h)', d.ai24h],
          ['AI failures (24h)', d.aiFailures24h],
          ['World chats now', d.worldActive],
        ].map(([l, v]) => (
          <div key={l} className="card">
            <p className="text-xs uppercase text-ink-400">{l}</p>
            <p className="text-2xl font-bold text-white">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold text-white">AI usage by feature (30d)</h2>
          <table className="w-full text-sm">
            <tbody>
              {d.aiByFeature30d.map((f: any) => (
                <tr key={f.feature} className="border-t border-white/5"><td className="py-1">{f.feature}</td><td>{f.count}</td><td className="text-xs text-ink-400">{f.inputTokens}/{f.outputTokens} tok</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold text-white">Top AI users (24h)</h2>
          <table className="w-full text-sm">
            <tbody>
              {d.topUsers24h.map((u: any) => (
                <tr key={u.id} className="border-t border-white/5"><td className="py-1">{u.email}</td><td><Badge>{u.plan}</Badge></td><td>{u.requests}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 className="mb-2 mt-4 font-semibold text-white">Autopilot (24h)</h2>
          <p className="text-sm">{d.autopilot24h.map((a: any) => `${a.action}: ${a.count}`).join(' · ') || 'none'}</p>
        </div>
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold text-white">World reports</h2>
        <p className="mb-2 text-xs text-ink-400">Reason only — conversation text is not shown here.</p>
        {d.worldReports.length === 0 ? <p className="text-sm text-ink-400">No reports.</p> : (
          <ul className="divide-y divide-white/5 text-sm">
            {d.worldReports.map((r: any) => (
              <li key={r.id} className="py-2">
                <Badge tone="amber">{r.reason}</Badge>
                <span className="ml-2 text-xs text-ink-400">{new Date(r.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold text-white">Support tickets</h2>
        {d.tickets.length === 0 ? <p className="text-sm text-ink-400">No tickets.</p> : (
          <ul className="divide-y divide-white/5 text-sm">
            {d.tickets.map((t: any) => (
              <li key={t.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{t.subject}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={t.status === 'open' ? 'amber' : 'green'}>{t.status}</Badge>
                    <button className="text-xs text-brand-300" onClick={async () => { await api('/api/admin/stats', { method: 'PATCH', body: { id: t.id, status: t.status === 'open' ? 'closed' : 'open' } }); load(); }}>
                      {t.status === 'open' ? 'close' : 'reopen'}
                    </button>
                  </span>
                </div>
                <p className="text-xs text-ink-400">{t.email} · {new Date(t.createdAt).toLocaleString()}</p>
                <p className="mt-1 whitespace-pre-wrap text-ink-200">{t.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
