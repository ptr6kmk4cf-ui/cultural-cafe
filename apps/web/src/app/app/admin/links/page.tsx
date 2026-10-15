'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

type Person = {
  id: string;
  name: string;
  email: string;
  city: string;
  country: string;
  phase: string;
  seenAt: string | null;
  guest?: boolean;
};

type LiveLink = {
  id: string;
  startedAt: string;
  endsAt: string;
  remainingMs: number;
  signals: number;
  messages: number;
  personA: Person;
  personB: Person;
};

function where(p: Person) {
  return [p.city, p.country].filter(Boolean).join(', ') || 'No city';
}

function phaseTone(phase: string): 'green' | 'amber' | 'default' {
  if (phase === 'open') return 'green';
  if (phase === 'away') return 'default';
  return 'amber';
}

function PersonCard({ person }: { person: Person }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-semibold text-white">{person.name}</p>
        <span className="flex shrink-0 gap-1">
          {person.guest && <Badge>Guest</Badge>}
          <Badge tone={phaseTone(person.phase)}>{person.phase}</Badge>
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-ink-300">{person.email}</p>
      <p className="mt-1 text-xs text-ink-400">{where(person)}</p>
      <p className="mt-1 text-xs text-ink-400">
        {person.seenAt ? `Here ${new Date(person.seenAt).toLocaleTimeString()}` : 'Left — connection data removed'}
      </p>
    </div>
  );
}

export default function AdminLinks() {
  const [links, setLinks] = useState<LiveLink[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const r = await api<{ links: LiveLink[] }>('/api/admin/links');
    setLinks(r.links);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  async function act(id: string, action: 'end' | 'clear') {
    setBusy(id + action);
    setError('');
    try {
      const r = await api<{ links: LiveLink[] }>('/api/admin/links', { body: { conversationId: id, action } });
      setLinks(r.links);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (error && !links) return <Alert kind="error">{error}</Alert>;
  if (!links) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live links"
        subtitle="Every open table. Chat text is not kept and is not shown here. When someone leaves, their connection data is deleted."
        actions={
          <>
            <Link href="/app/admin" className="btn-secondary text-xs">Operator</Link>
            <Link href="/app/admin/users" className="btn-secondary text-xs">Registered users</Link>
          </>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {links.length === 0 ? (
        <div className="card text-sm text-ink-300">No one is at a table right now.</div>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => {
            const mins = Math.floor(link.remainingMs / 60000);
            return (
              <li key={link.id} className="card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="green">{mins} min left</Badge>
                    <span className="text-xs text-ink-400">Setup rows {link.signals} · stored lines {link.messages}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!!busy} onClick={() => act(link.id, 'clear')}>
                      {busy === link.id + 'clear' ? 'Clearing…' : 'Clear connection data'}
                    </button>
                    <button
                      className="btn-primary px-3 py-1.5 text-xs"
                      disabled={!!busy}
                      onClick={() => {
                        if (!confirm('Close this table and delete its connection data?')) return;
                        void act(link.id, 'end');
                      }}
                    >
                      {busy === link.id + 'end' ? 'Closing…' : 'Close table'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <PersonCard person={link.personA} />
                  <div className="grid place-items-center text-xs text-ink-400 sm:px-1">↔</div>
                  <PersonCard person={link.personB} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
