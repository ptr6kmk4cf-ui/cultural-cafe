import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { forgetPastContact } from '@/lib/services/world';

/** Drops one person from Past contacts and discards their tables and invites. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ peerId: z.string().min(1) }));
  return json(await forgetPastContact(user.id, body.peerId));
});
