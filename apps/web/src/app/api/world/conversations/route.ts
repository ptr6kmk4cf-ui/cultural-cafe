import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { serializeConversations } from '@/lib/services/world';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const rows = await db.worldConversation.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    orderBy: { startedAt: 'desc' },
    take: 30,
  });
  return json({ conversations: await serializeConversations(rows, user.id) });
});
