'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Badge, Empty, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';
import { sitWithPastPeer } from '@/lib/past-sit';

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
  const { t } = useUi();
  const [hours, setHours] = useState<CafeHour[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    api('/api/world/conversations')
      .then((d) => setHours(d.conversations))
      .catch((e) => {
        setError(e.message);
        setHours([]);
      });
  }, []);

  async function sit(contact: PastContact) {
    const peerId = contact.peer?.id;
    if (!peerId || busy) return;
    setBusy(`sit:${peerId}`);
    setError('');
    try {
      const next = await sitWithPastPeer(peerId);
      if (next === 'waiting') setError(t('mustAccept', { name: contact.peer?.name ?? t('someone') }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function remove(contact: PastContact) {
    const peerId = contact.peer?.id;
    if (!peerId || busy) return;
    const name = contact.peer?.name ?? 'this person';
    if (!confirm(`Remove ${name} from past contacts? Their table is discarded.`)) return;
    setBusy(`forget:${peerId}`);
    setError('');
    try {
      await api('/api/world/contacts/forget', { body: { peerId } });
      setHours((prev) => (prev ?? []).filter((hour) => hour.status === 'ACTIVE' || hour.peer?.id !== peerId));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  const contacts = pastContacts(hours ?? []).filter((c) => {
    const hay = `${c.peer?.name ?? ''} ${c.peer?.city ?? ''} ${c.prompt?.title ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title={t('past')}
        actions={<Link href="/app/world/spin" className="btn-primary">{t('spin')}</Link>}
      />
      <div className="mb-4">
        <input className="input max-w-xs" placeholder={t('findPerson')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
      {!hours ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <Empty title={t('noneYet')}>
          <Link href="/app" className="text-brand-300 hover:underline">{t('yourProfile')}</Link>
        </Empty>
      ) : (
        <div className="card divide-y divide-white/5 p-0">
          {contacts.map((c) => {
            const where = [c.peer?.city, c.peer?.country].filter(Boolean).join(', ');
            const peerId = c.peer?.id ?? '';
            const sitting = busy === `sit:${peerId}`;
            const removing = busy === `forget:${peerId}`;
            const sitLabel = c.peer?.guest
              ? t('sitWith', { name: c.peer?.name ?? t('someone') })
              : t('askName', { name: c.peer?.name ?? t('someone') });
            return (
              <article key={peerId || c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:text-white disabled:opacity-60"
                  disabled={!peerId || !!busy}
                  onClick={() => void sit(c)}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500/40 to-amber-700/40 font-semibold text-white">{(c.peer?.name ?? 'C')[0]}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-white">
                      {c.peer?.name ?? t('someone')}
                      {where ? ` · ${where}` : ''}
                    </p>
                    <p className="text-xs text-ink-400">
                      {c.prompt?.title ?? 'Café table'}
                      {c.peer?.languageLabel ? ` · ${c.peer.languageLabel}` : ''}
                      {c.meetings > 1 ? ` · ${c.meetings} tables` : ''}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {c.peer?.guest && <Badge>{t('guest')}</Badge>}
                  <span className="text-xs text-ink-400">{new Date(c.startedAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 text-xs"
                    disabled={!peerId || !!busy}
                    onClick={() => void sit(c)}
                  >
                    {sitting ? (c.peer?.guest ? t('opening') : t('asking')) : sitLabel}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs text-red-300"
                    disabled={!peerId || !!busy}
                    onClick={() => void remove(c)}
                  >
                    {removing ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
