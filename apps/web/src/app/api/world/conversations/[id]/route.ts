import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { expireStale, listWorldMessages, requireParticipant, serializeConversation } from '@/lib/services/world';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await expireStale();
  const c = await requireParticipant(user.id, id);
  const skipMessages = req.nextUrl.searchParams.get('messages') === '0';
  return json({
    conversation: await serializeConversation(c, user.id),
    messages: skipMessages ? undefined : await listWorldMessages(user.id, id, { known: c }),
  });
});
