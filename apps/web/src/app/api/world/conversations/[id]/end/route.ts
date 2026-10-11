import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { endConversation, serializeConversation } from '@/lib/services/world';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const c = await endConversation(user.id, id);
  return json({ conversation: await serializeConversation(c, user.id) });
});
