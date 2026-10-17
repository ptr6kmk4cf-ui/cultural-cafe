import { api } from '@/lib/client';

export type PastPeer = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  languageLabel?: string;
  guest?: boolean;
  online?: boolean;
};

export type PastHour = {
  id: string;
  status?: string;
  startedAt: string;
  prompt?: { title?: string };
  peer: PastPeer | null;
};

export function groupPastContacts<T extends PastHour>(hours: T[]) {
  const byPerson = new Map<string, T & { meetings: number }>();
  for (const hour of hours) {
    if (hour.status === 'ACTIVE' || !hour.peer?.id) continue;
    const existing = byPerson.get(hour.peer.id);
    if (!existing) {
      byPerson.set(hour.peer.id, { ...hour, meetings: 1 });
      continue;
    }
    existing.meetings += 1;
    if (hour.peer.online && existing.peer) existing.peer = { ...existing.peer, online: true };
  }
  return [...byPerson.values()].sort((a, b) => Number(!!b.peer?.online) - Number(!!a.peer?.online));
}

export const SIT_PAST_MS = 12_000;

export async function sitWithPastPeer(peerId: string) {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), SIT_PAST_MS);
  try {
    const result = await api<{ conversation?: { id: string } | null }>('/api/world/contacts/sit', {
      body: { peerId },
      signal: ac.signal,
    });
    if (result.conversation?.id) {
      window.location.href = `/app/world/${result.conversation.id}`;
      return 'open' as const;
    }
    return 'waiting' as const;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('Could not open that table. Tap Sit with again.');
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}
