'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Empty, PageHeader, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';

type M = {
  id: string;
  name: string;
  age: number | null;
  location: string | null;
  score: number;
  reasons: string[];
  cautions: string[];
  photoObservations: string[];
  status: 'SHORTLISTED' | 'CONTACTED';
  contactId: string | null;
  platform: string;
};

export default function Shortlist() {
  const [list, setList] = useState<M[] | null>(null);
  const [toast, show] = useToast();
  const load = () => api('/api/matches').then((d) => setList(d.matches));
  useEffect(() => {
    load();
  }, []);

  async function start(m: M) {
    try {
      const { contact } = await api(`/api/matches/${m.id}/contact`, { method: 'POST' });
      window.location.href = `/app/conversations/${contact.id}?openers=1`;
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }
  async function dismiss(m: M) {
    await api(`/api/matches/${m.id}`, { method: 'DELETE' });
    show(`${m.name} removed and discarded`);
    load();
  }

  if (!list) return <Spinner />;
  return (
    <div>
      <PageHeader title="Selected matches" subtitle="Profiles the AI recommended, with its reasons. Dismissing a match deletes its data." />
      {list.length === 0 ? (
        <Empty title="No matches yet">
          Run <b>Find matches</b> from the extension panel on a supported site. <Link className="text-brand-300" href="/app/matches">Set preferences →</Link>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((m) => (
            <div key={m.id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {m.name}{m.age ? `, ${m.age}` : ''}
                  </h3>
                  <p className="text-xs text-ink-400">{m.location} · {m.platform}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-brand-300">{m.score}</div>
                  <div className="text-[10px] uppercase text-ink-400">match score</div>
                </div>
              </div>
              <ul className="space-y-1 text-sm">
                {m.reasons?.map((r) => <li key={r} className="text-emerald-200">✓ {r}</li>)}
                {m.cautions?.map((r) => <li key={r} className="text-amber-200">! {r}</li>)}
              </ul>
              {m.photoObservations?.length > 0 && (
                <div className="flex flex-wrap gap-1">{m.photoObservations.map((o) => <span key={o} className="chip">📷 {o}</span>)}</div>
              )}
              <div className="flex items-center gap-2 pt-1">
                {m.status === 'CONTACTED' && m.contactId ? (
                  <>
                    <Badge tone="green">Contacted</Badge>
                    <Link className="btn-secondary" href={`/app/conversations/${m.contactId}`}>Open conversation</Link>
                  </>
                ) : (
                  <>
                    <button className="btn-primary" onClick={() => start(m)}>Write opener</button>
                    <button className="btn-ghost" onClick={() => dismiss(m)}>Dismiss</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {toast}
    </div>
  );
}
