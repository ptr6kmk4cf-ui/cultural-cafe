import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { activeConversation, expireStale, pendingInvites, serializeInvite } from '@/lib/services/world';

/** Pending table requests, without refreshing the whole café. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  await expireStale();
  const [conv, invites] = await Promise.all([
    activeConversation(user.id),
    pendingInvites(user.id),
  ]);
  return json({
    conversationId: conv?.id ?? null,
    invites: await Promise.all(invites.map((invite) => serializeInvite(invite, user.id))),
  });
});
