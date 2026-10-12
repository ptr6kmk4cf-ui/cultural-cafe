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
  peer: { id: string; name: string; city?: string; country?: string; languageLabel?: string; guest?: boolean } | null;
};

type PastContact = CafeHour & { meetings: number };

function pastContacts(hours: CafeHour[]) {
  const byPerson = new Map<string, PastContact>();
  for (const hour of hours) {
    if (hour.status === 'ACTIVE' || !hour.peer?.id) continue;
    const existing = byPerson.get(hour.peer.id);
    if (!existing) {
      byPerson.set(hour.peer.id, { ...hour, meetings: 1 });
      continue;
    }
    existing.meetings += 1;
  }
  return [...byPerson.values()];
}

export default function Conversations() {
  const [hours, setHours] = useState<CafeHour[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    api('/api/world/conversations').then((d) => setHours(d.conversations));
  }, []);

  const contacts = pastContacts(hours ?? []).filter((c) => {
    const hay = `${c.peer?.name ?? ''} ${c.peer?.city ?? ''} ${c.prompt?.title ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title="Past contacts"
        subtitle="People you already sat with. A new café session does not include them."
        actions={<Link href="/app/world#meet" className="btn-primary">Meet someone</Link>}
      />
      <div className="mb-4">
        <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!hours ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <Empty title="No past contacts yet.">
          <Link href="/app" className="text-brand-300 hover:underline">Start with your profile</Link>
        </Empty>
      ) : (
        <div className="card divide-y divide-white/5 p-0">
          {contacts.map((c) => {
            const where = [c.peer?.city, c.peer?.country].filter(Boolean).join(', ');
            return (
              <article key={c.peer?.id ?? c.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500/40 to-amber-700/40 font-semibold text-white">{(c.peer?.name ?? 'C')[0]}</span>
                  <div>
                    <p className="font-medium text-white">
                      {c.peer?.name ?? 'Someone'}
                      {where ? ` · ${where}` : ''}
                    </p>
                    <p className="text-xs text-ink-400">
                      {c.prompt?.title ?? 'Café table'}
                      {c.peer?.languageLabel ? ` · ${c.peer.languageLabel}` : ''}
                      {c.meetings > 1 ? ` · ${c.meetings} tables` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.peer?.guest && <Badge>Guest</Badge>}
                  <span className="text-xs text-ink-400">{new Date(c.startedAt).toLocaleDateString()}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
