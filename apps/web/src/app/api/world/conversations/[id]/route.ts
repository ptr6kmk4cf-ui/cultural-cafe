import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { expireStale, requireParticipant, serializeConversation } from '@/lib/services/world';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await expireStale();
  const c = await requireParticipant(user.id, id);
  return json({
    conversation: await serializeConversation(c, user.id),
    messages: [],
    transport: 'webrtc',
  });
});
