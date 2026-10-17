import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { sitWithPastContact } from '@/lib/services/world';

/** Opens a new table with someone from Past contacts. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`world-sit:${user.id}`, 30, 5 * 60_000);
  const body = await parseBody(req, z.object({ peerId: z.string().min(1).max(40) }));
  return json(await sitWithPastContact(user, body.peerId), 201);
});
