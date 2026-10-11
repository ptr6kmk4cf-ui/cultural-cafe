'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Empty, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

type CafeHour = {
  id: string;
  status: string;
  startedAt: string;
  prompt?: { title: string; question: string };
  peer: { name: string; city?: string; country?: string; languageLabel?: string } | null;
};

export default function Conversations() {
  const [hours, setHours] = useState<CafeHour[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    api('/api/world/conversations').then((d) => setHours(d.conversations));
  }, []);

  const cafeFiltered = hours?.filter((c) => {
    const hay = `${c.peer?.name ?? ''} ${c.prompt?.title ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  return (
    <div>
      <PageHeader title="Café hours" actions={<Link href="/app/world" className="btn-primary">Sit down in the Café</Link>} />
      <div className="mb-4">
        <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!cafeFiltered ? (
        <Spinner />
      ) : cafeFiltered.length === 0 ? (
        <Empty title="No café hours yet.">
          <Link href="/app/world" className="text-brand-300 hover:underline">Sit down in the Café</Link>
        </Empty>
      ) : (
        <div className="card divide-y divide-white/5 p-0">
          {cafeFiltered.map((c) => (
            <Link key={c.id} href={`/app/world/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500/40 to-amber-700/40 font-semibold text-white">{(c.peer?.name ?? 'C')[0]}</span>
                <div>
                  <p className="font-medium text-white">{c.peer?.name ?? 'Someone'}{c.peer?.city ? ` · ${c.peer.city}` : ''}</p>
                  <p className="text-xs text-ink-400">
                    {c.prompt?.title ?? 'Café hour'}
                    {c.peer?.languageLabel ? ` · ${c.peer.languageLabel}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.status === 'ACTIVE' && <Badge tone="green">In progress</Badge>}
                <span className="text-xs text-ink-400">{new Date(c.startedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
