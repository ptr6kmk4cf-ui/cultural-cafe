'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui';
import { api } from '@/lib/client';

type Invite = {
  id: string;
  iAccepted: boolean;
  peer: { name: string; city: string } | null;
};

export function WaitingInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const sawInvite = useRef(false);

  async function load() {
    const s = await api<{ invites: Invite[]; conversation: { id: string } | null }>('/api/world/state');
    const pending = s.invites ?? [];
    if (pending.length) sawInvite.current = true;
    if (s.conversation && sawInvite.current) {
      window.location.href = `/app/world/${s.conversation.id}`;
      return;
    }
    setInvites(pending);
  }

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    async function tick() {
      try {
        await load();
      } catch {
        /* home still works if this check fails */
      }
      if (!stopped) timer = window.setTimeout(tick, 8000);
    }
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    setError('');
    try {
      const r = await api<{ conversation: { id: string } | null }>(`/api/world/invites/${id}`, { body: { accept } });
      if (r.conversation) window.location.href = `/app/world/${r.conversation.id}`;
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  if (!invites.length && !error) return null;

  return (
    <div className="space-y-3">
      {error && <Alert kind="error">{error}</Alert>}
      {invites.length > 0 && <h2 className="font-semibold text-white">Still waiting</h2>}
      {invites.map((i) => (
        <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-white">{i.peer?.name ?? 'Someone'}{i.peer?.city ? ` · ${i.peer.city}` : ''}</p>
            <p className="text-sm text-ink-300">
              {i.iAccepted
                ? 'You said yes. The table starts when they say yes.'
                : 'Tap Accept to sit down, or Decline to skip them.'}
            </p>
          </div>
          <div className="flex gap-2">
            {!i.iAccepted && (
              <button className="btn-primary" disabled={!!busy} onClick={() => respond(i.id, true)}>Accept</button>
            )}
            <button className="btn-secondary" disabled={!!busy} onClick={() => respond(i.id, false)}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
