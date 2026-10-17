import { api } from '@/lib/client';

export async function sitWithPastPeer(peerId: string) {
  const result = await api<{ conversation?: { id: string } | null }>('/api/world/contacts/sit', {
    body: { peerId },
  });
  if (result.conversation?.id) {
    window.location.href = `/app/world/${result.conversation.id}`;
    return 'open' as const;
  }
  return 'waiting' as const;
}
