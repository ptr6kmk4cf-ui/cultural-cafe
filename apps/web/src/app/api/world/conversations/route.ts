import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { serializePastHours } from '@/lib/services/world';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const rows = await db.worldConversation.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    orderBy: { startedAt: 'desc' },
    take: 80,
  });
  return json({ conversations: await serializePastHours(rows, user.id) });
});
