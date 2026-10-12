import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, parseBody, route, HttpError } from '@/lib/http';
import { activeConversation, endConversation, expireStale, leaveQueue } from '@/lib/services/world';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, z.object({ userId: z.string().min(1) }));
  if (b.userId === user.id) throw new HttpError(400, 'You cannot block yourself.');
  await db.worldBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: b.userId } },
    update: {},
    create: { blockerId: user.id, blockedId: b.userId },
  });
  await db.worldInvite.updateMany({
    where: { status: 'PENDING', OR: [{ fromId: user.id, toId: b.userId }, { fromId: b.userId, toId: user.id }] },
    data: { status: 'CANCELLED' },
  });
  await expireStale();
  const conv = await activeConversation(user.id);
  if (conv && (conv.userAId === b.userId || conv.userBId === b.userId)) await endConversation(user.id, conv.id);
  await leaveQueue(user.id);
  return json({ ok: true });
});
