'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { languageName } from '@conversa/shared';
import { Badge, Empty, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

type C = {
  id: string;
  name: string;
  source: string;
  platform: string | null;
  language: string | null;
  status: string;
  doNotContact: boolean;
  humanTakeover: boolean;
  lastActivityAt: string;
  messageCount: number;
};

export default function Conversations() {
  const [tab, setTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [list, setList] = useState<C[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    setList(null);
    api(`/api/contacts?status=${tab}`).then((d) => setList(d.contacts));
  }, [tab]);

  const filtered = list?.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Conversations" actions={<Link href="/app/contacts/new" className="btn-primary">+ Add contact</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['ACTIVE', 'ARCHIVED'] as const).map((t) => (
          <button key={t} className={t === tab ? 'btn-secondary' : 'btn-ghost'} onClick={() => setTab(t)}>{t === 'ACTIVE' ? 'Active' : 'Archived'}</button>
        ))}
        <input className="input ml-auto max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty title="No conversations here yet." />
      ) : (
        <div className="card divide-y divide-white/5 p-0">
          {filtered.map((c) => (
            <Link key={c.id} href={`/app/conversations/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500/40 to-amber-700/40 font-semibold text-white">{c.name[0]}</span>
                <div>
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-xs text-ink-400">
                    {c.messageCount} messages · {c.source.toLowerCase()}
                    {c.platform ? ` · ${c.platform}` : ''}
                    {c.language ? ` · ${languageName(c.language)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.doNotContact && <Badge tone="red">Do not contact</Badge>}
                {c.humanTakeover && <Badge tone="amber">Needs you</Badge>}
                <span className="text-xs text-ink-400">{new Date(c.lastActivityAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
