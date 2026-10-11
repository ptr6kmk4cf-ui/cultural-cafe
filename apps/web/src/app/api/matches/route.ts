import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const platform = req.nextUrl.searchParams.get('platform');
  const rows = await db.matchCandidate.findMany({
    where: { userId: user.id, ...(platform ? { platform } : {}) },
    orderBy: [{ status: 'asc' }, { score: 'desc' }],
  });
  return json({
    matches: rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      externalId: r.externalId,
      name: r.name,
      age: r.age,
      location: r.location,
      score: r.score,
      ...(r.reasons as object),
      status: r.status,
      contactId: r.contactId,
      createdAt: r.createdAt,
    })),
  });
});

/** Clear the whole shortlist (contacts already created are kept). */
export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await db.matchCandidate.deleteMany({ where: { userId: user.id, status: 'SHORTLISTED' } });
  return json({ ok: true });
});
