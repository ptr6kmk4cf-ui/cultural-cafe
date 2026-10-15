'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { languageName } from '@conversa/shared';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';
import {
  labelPlace,
  seatedIds,
  waitingPeople,
  type OperatorPeer,
  type OperatorPerson,
  type OperatorSnapshot,
  type OperatorTable,
} from '@/lib/operator-tree';

type Stats = {
  users: number;
  premium: number;
  newUsers30d: number;
  ai24h: number;
  aiFailures24h: number;
  aiByFeature30d: { feature: string; count: number; inputTokens: number; outputTokens: number }[];
  topUsers24h: { id?: string; email?: string; plan?: string; requests: number }[];
  autopilot24h: { action: string; count: number }[];
  tickets: { id: string; email: string; subject: string; body: string; status: string; createdAt: string }[];
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function minsLeft(ms: number) {
  return `${Math.max(0, Math.floor(ms / 60000))} min left`;
}

function phaseTone(phase: string): 'green' | 'amber' | 'default' {
  if (phase === 'open') return 'green';
  if (phase === 'away') return 'default';
  return 'amber';
}

function linkTone(link: OperatorTable['link']): 'green' | 'amber' | 'default' {
  if (link === 'linked') return 'green';
  if (link === 'not connected') return 'default';
  return 'amber';
}

function place(person: { city: string; country: string }) {
  return labelPlace(person.city, person.country) || 'No city';
}

function handshake(table: OperatorTable) {
  const counts = new Map(table.signalTypes.map((row) => [row.type, row.count]));
  return ['offer', 'answer', 'ice', 'restart'].map((type) => `${type} ${counts.get(type) ?? 0}`).join(' → ');
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold text-white">{title}</h2>
        {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function PeerLine({ person }: { person: OperatorPeer }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-white">{person.name}</span>
      {person.guest && <Badge>Guest</Badge>}
      {person.gender && <Badge>{person.gender}</Badge>}
      <Badge tone={phaseTone(person.phase)}>{person.phase}</Badge>
      <span className="text-xs text-ink-400">
        {place(person)} · {languageName(person.language)} · {person.email}
      </span>
    </div>
  );
}

export default function Admin() {
  const [board, setBoard] = useState<OperatorSnapshot | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'table'>('all');
  const [showGuests, setShowGuests] = useState(false);

  async function load() {
    const [nextBoard, nextStats] = await Promise.all([
      api<OperatorSnapshot>('/api/admin/console'),
      api<Stats>('/api/admin/stats'),
    ]);
    setBoard(nextBoard);
    setStats(nextStats);
    setError('');
  }

  useEffect(() => {
    let stop = false;
    const run = () => {
      load().catch((e) => {
        if (!stop) setError((e as Error).message);
      });
    };
    run();
    const timer = setInterval(run, 8000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  async function act(id: string, action: 'end' | 'clear') {
    setBusy(id + action);
    setError('');
    try {
      await api('/api/admin/links', { body: { conversationId: id, action } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const waiting = useMemo(
    () => (board ? waitingPeople(board.people, seatedIds(board.openTables)) : []),
    [board],
  );

  const visiblePeople = useMemo(() => {
    if (!board) return [];
    const q = query.trim().toLowerCase();
    const rows = showGuests ? [...board.people, ...board.guests] : board.people;
    return rows.filter((person) => {
      if (filter === 'online' && !person.online) return false;
      if (filter === 'table' && !person.atTable) return false;
      if (!q) return true;
      return [person.name, person.email, person.city, person.country, person.language].join(' ').toLowerCase().includes(q);
    });
  }, [board, query, filter, showGuests]);

  if (error && !board) return <Alert kind="error">{error}</Alert>;
  if (!board) return <Spinner />;

  const counts = [
    ['People', board.counts.people],
    ['People online', board.counts.peopleOnline],
    ['Guests online', board.counts.guestsPresent],
    ['Open tables', board.counts.tables],
    ['Links up', board.counts.linked],
    ['Invites waiting', board.counts.pendingInvites],
    ['Blocks', board.counts.blocks],
    ['Reports', board.counts.reports],
    ['Sessions', board.counts.sessions],
    ['Opted in', board.counts.optedIn],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operator"
        subtitle="Who is in the café, who is seated, and whether the direct link between them is up. Chat text, photos, and connection payloads are not shown."
        actions={
          <>
            <Link href="/app/admin/users" className="btn-secondary text-xs">Registered users</Link>
            <Link href="/app/admin/links" className="btn-secondary text-xs">Live links</Link>
          </>
        }
      />
      <p className="text-xs text-ink-400">Updated {new Date(board.now).toLocaleTimeString()}</p>
      {error && <Alert kind="error">{error}</Alert>}
      {board.counts.loose > 0 && (
        <p className="text-xs text-ink-400">{board.counts.loose} old test accounts are hidden from this console.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {counts.map(([label, value]) => (
          <div key={label} className="card !p-4">
            <p className="text-xs uppercase text-ink-400">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <Section
        title="Peer tree"
        hint="Each open table is one direct link. Open means the data channel is up. Connecting means the handshake is still going. Away means that person left the table."
      >
        <div className="text-sm">
          <p className="font-medium text-white">Cultural Café</p>
          <ul className="ml-3 border-l border-white/15 pl-3">
            <li className="relative py-2">
              <span className="absolute -left-3 top-4 h-px w-3 bg-white/15" />
              <p className="text-ink-200">Open tables · {board.openTables.length}</p>
              {board.openTables.length === 0 ? (
                <p className="mt-1 text-xs text-ink-400">No one is at a table. A link appears here when two people sit.</p>
              ) : (
                <ul className="ml-3 border-l border-white/15 pl-3">
                  {board.openTables.map((table) => (
                    <li key={table.id} className="relative py-3">
                      <span className="absolute -left-3 top-5 h-px w-3 bg-white/15" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={linkTone(table.link)}>{table.link}</Badge>
                          <span className="text-xs text-ink-400">{minsLeft(table.remainingMs)}</span>
                          <span className="text-xs text-ink-400">stored lines {table.messages} · setup rows {table.signals}</span>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!!busy} onClick={() => act(table.id, 'clear')}>
                            {busy === table.id + 'clear' ? 'Clearing…' : 'Clear connection data'}
                          </button>
                          <button
                            className="btn-primary px-3 py-1.5 text-xs"
                            disabled={!!busy}
                            onClick={() => {
                              if (!confirm('Close this table and delete its connection data?')) return;
                              void act(table.id, 'end');
                            }}
                          >
                            {busy === table.id + 'end' ? 'Closing…' : 'Close table'}
                          </button>
                        </div>
                      </div>
                      <ul className="ml-3 mt-2 border-l border-white/15 pl-3">
                        {[table.personA, table.personB].map((person) => (
                          <li key={person.id} className="relative py-1.5">
                            <span className="absolute -left-3 top-4 h-px w-3 bg-white/15" />
                            <PeerLine person={person} />
                          </li>
                        ))}
                        <li className="relative py-1.5">
                          <span className="absolute -left-3 top-4 h-px w-3 bg-white/15" />
                          <p className="font-mono text-xs text-ink-300">{handshake(table)}</p>
                        </li>
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </li>
            <li className="relative py-2">
              <span className="absolute -left-3 top-4 h-px w-3 bg-white/15" />
              <p className="text-ink-200">In the café, not at a table</p>
              <ul className="ml-3 border-l border-white/15 pl-3">
                {waiting.length === 0 && (
                  <li className="relative py-1.5 text-xs text-ink-400">
                    <span className="absolute -left-3 top-3 h-px w-3 bg-white/15" />
                    No signed-in person is waiting.
                  </li>
                )}
                {waiting.map((person) => (
                  <li key={person.id} className="relative py-1.5">
                    <span className="absolute -left-3 top-4 h-px w-3 bg-white/15" />
                    <span className="font-medium text-white">{person.name}</span>
                    <span className="ml-2 text-xs text-ink-400">
                      {place(person)} · {languageName(person.language)} · {person.email}
                    </span>
                  </li>
                ))}
                <li className="relative py-1.5 text-xs text-ink-300">
                  <span className="absolute -left-3 top-3 h-px w-3 bg-white/15" />
                  {board.counts.guestsWaiting} guests are online and not at a table.
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </Section>

      <Section title="Places" hint="City and country are what people wrote on their profile.">
        {board.places.length === 0 ? (
          <p className="text-sm text-ink-400">No places yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {board.places.map((row) => (
              <span key={row.country} className="chip">
                {labelPlace('', row.country)} · {row.count}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="People" hint="Signed-in accounts. Guests stay hidden until you ask for them.">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, or city" />
          {(['all', 'online', 'table'] as const).map((key) => (
            <button key={key} className={`chip ${filter === key ? 'border-brand-400 text-white' : ''}`} onClick={() => setFilter(key)}>
              {key === 'all' ? 'All' : key === 'online' ? 'Online' : 'At a table'}
            </button>
          ))}
          <button className={`chip ${showGuests ? 'border-brand-400 text-white' : ''}`} onClick={() => setShowGuests((value) => !value)}>
            {showGuests ? 'Hide guests' : `Show guests (${board.counts.guests})`}
          </button>
        </div>
        <PeopleTable people={visiblePeople} />
      </Section>

      <Section title="Tables" hint="Who sat down. Lines are deleted when a table closes, so this is not what they wrote.">
        {board.recent.length === 0 ? (
          <p className="text-sm text-ink-400">No tables yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Lines</th>
                  <th className="py-2 font-medium">Setup</th>
                </tr>
              </thead>
              <tbody>
                {board.recent.map((table) => (
                  <tr key={table.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 text-xs text-ink-300">{when(table.startedAt)}</td>
                    <td className="py-2 pr-3">
                      {table.personA.name}
                      {table.personA.guest ? ' (guest)' : ''} ↔ {table.personB.name}
                      {table.personB.guest ? ' (guest)' : ''}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={table.status === 'ACTIVE' ? 'green' : 'default'}>
                        {table.status === 'ACTIVE' ? minsLeft(table.remainingMs) : 'closed'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{table.messages}</td>
                    <td className="py-2">{table.signals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {board.recent.length === 40 && <p className="text-xs text-ink-400">Showing the latest 40 tables.</p>}
      </Section>

      <Section title="Invites" hint={`${board.counts.pendingInvites} still waiting for an answer.`}>
        {board.invites.length === 0 ? (
          <p className="text-sm text-ink-400">No invites.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">From</th>
                  <th className="py-2 pr-3 font-medium">To</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {board.invites.map((invite) => (
                  <tr key={invite.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 text-xs text-ink-300">{when(invite.createdAt)}</td>
                    <td className="py-2 pr-3">{invite.from.name}</td>
                    <td className="py-2 pr-3">{invite.to.name}</td>
                    <td className="py-2 pr-3">{invite.kind.toLowerCase()}</td>
                    <td className="py-2">
                      <Badge tone={invite.status === 'PENDING' ? 'amber' : invite.status === 'ACCEPTED' ? 'green' : 'default'}>
                        {invite.status.toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Blocks">
          {board.blocks.length === 0 ? (
            <p className="text-sm text-ink-400">No blocks.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {board.blocks.map((block) => (
                <li key={block.id} className="py-2">
                  <span className="text-white">{block.blocker.name}</span>
                  <span className="text-ink-400"> blocked </span>
                  <span className="text-white">{block.blocked.name}</span>
                  <p className="text-xs text-ink-400">{when(block.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Reports" hint="The reason only. The conversation is not included.">
          {board.reports.length === 0 ? (
            <p className="text-sm text-ink-400">No reports.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {board.reports.map((report) => (
                <li key={report.id} className="py-2">
                  <Badge tone="amber">{report.reason}</Badge>
                  <p className="mt-1">
                    {report.reporter.name}
                    <span className="text-ink-400"> about </span>
                    {report.target?.name ?? 'someone who left'}
                  </p>
                  <p className="text-xs text-ink-400">{when(report.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Premium', stats.premium],
              ['New in 30 days', stats.newUsers30d],
              ['AI requests today', stats.ai24h],
              ['AI failures today', stats.aiFailures24h],
            ].map(([label, value]) => (
              <div key={label} className="card !p-4">
                <p className="text-xs uppercase text-ink-400">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="AI usage by feature (30 days)">
              {stats.aiByFeature30d.length === 0 ? (
                <p className="text-sm text-ink-400">None.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {stats.aiByFeature30d.map((row) => (
                      <tr key={row.feature} className="border-t border-white/5">
                        <td className="py-1">{row.feature}</td>
                        <td>{row.count}</td>
                        <td className="text-xs text-ink-400">{row.inputTokens}/{row.outputTokens} tok</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
            <Section title="Top AI users today">
              {stats.topUsers24h.length === 0 ? (
                <p className="text-sm text-ink-400">None.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {stats.topUsers24h.map((user) => (
                      <tr key={user.id ?? user.email} className="border-t border-white/5">
                        <td className="py-1">{user.email}</td>
                        <td>{user.plan && <Badge>{user.plan}</Badge>}</td>
                        <td>{user.requests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-sm text-ink-300">
                Autopilot today: {stats.autopilot24h.map((row) => `${row.action}: ${row.count}`).join(' · ') || 'none'}
              </p>
            </Section>
          </div>
          <Section title="Support tickets">
            {stats.tickets.length === 0 ? (
              <p className="text-sm text-ink-400">No tickets.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {stats.tickets.map((ticket) => (
                  <li key={ticket.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white">{ticket.subject}</span>
                      <span className="flex items-center gap-2">
                        <Badge tone={ticket.status === 'open' ? 'amber' : 'green'}>{ticket.status}</Badge>
                        <button
                          className="text-xs text-brand-300"
                          onClick={async () => {
                            await api('/api/admin/stats', {
                              method: 'PATCH',
                              body: { id: ticket.id, status: ticket.status === 'open' ? 'closed' : 'open' },
                            });
                            await load();
                          }}
                        >
                          {ticket.status === 'open' ? 'close' : 'reopen'}
                        </button>
                      </span>
                    </div>
                    <p className="text-xs text-ink-400">{ticket.email} · {when(ticket.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-ink-200">{ticket.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function PeopleTable({ people }: { people: OperatorPerson[] }) {
  if (people.length === 0) return <p className="text-sm text-ink-400">No one matches.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-ink-400">
          <tr>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Place</th>
            <th className="py-2 pr-3 font-medium">Language</th>
            <th className="py-2 pr-3 font-medium">Seen</th>
            <th className="py-2 font-medium">Café</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="border-t border-white/5">
              <td className="py-2 pr-3">
                <p className="text-white">{person.name}</p>
                <p className="text-xs text-ink-400">{person.email}</p>
              </td>
              <td className="py-2 pr-3">{place(person)}</td>
              <td className="py-2 pr-3">{languageName(person.language)}</td>
              <td className="py-2 pr-3 text-xs text-ink-300">{when(person.lastSeenAt)}</td>
              <td className="py-2">
                <span className="flex flex-wrap gap-1">
                  {person.guest && <Badge>Guest</Badge>}
                  {person.role === 'ADMIN' && <Badge tone="brand">Admin</Badge>}
                  {person.online && <Badge tone="green">Online</Badge>}
                  {person.atTable && <Badge tone="amber">At a table</Badge>}
                  {person.optedIn && <Badge>Opted in</Badge>}
                  {person.gender && <Badge>{person.gender}</Badge>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
