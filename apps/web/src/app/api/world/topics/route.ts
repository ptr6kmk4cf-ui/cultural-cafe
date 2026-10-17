import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { saveCafeTopic } from '@/lib/services/cafe-topics';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`world-topic:${user.id}`, 12, 60 * 60_000);
  const body = await parseBody(req, z.object({ text: z.string().max(80) }));
  await saveCafeTopic(user.id, body.text);
  return json({ ok: true });
});
