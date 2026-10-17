import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { inviteFromBrowse } from '@/lib/services/world';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`world-invite:${user.id}`, 20, 60 * 60_000);
  const b = await parseBody(req, z.object({ toId: z.string().min(1).max(40) }));
  return json(await inviteFromBrowse(user, b.toId), 201);
});
