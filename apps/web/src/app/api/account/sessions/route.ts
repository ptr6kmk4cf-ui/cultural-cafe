import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: { id: true, kind: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { lastUsedAt: 'desc' },
  });
  return json({ sessions });
});

/** Sign out everywhere (all web sessions and extension tokens). */
export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await db.session.deleteMany({ where: { userId: user.id } });
  return json({ ok: true });
});
