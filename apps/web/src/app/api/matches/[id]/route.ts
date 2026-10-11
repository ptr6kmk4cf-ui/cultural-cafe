import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, notFound, route } from '@/lib/http';

/** Dismissing a match deletes it entirely (no "rejected" record is kept). */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const res = await db.matchCandidate.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw notFound();
  return json({ ok: true });
});
