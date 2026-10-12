import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { expireStale, serializeConversations } from '@/lib/services/world';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  await expireStale();
  const rows = await db.worldConversation.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    orderBy: { startedAt: 'desc' },
    take: 30,
  });
  return json({ conversations: await serializeConversations(rows, user.id) });
});
