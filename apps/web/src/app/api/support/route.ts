import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`support:${user.id}`, 5, 60 * 60_000);
  const b = await parseBody(req, z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(5000) }));
  const t = await db.supportTicket.create({ data: { userId: user.id, email: user.email, subject: b.subject, body: b.body } });
  return json({ ticket: { id: t.id } }, 201);
});
