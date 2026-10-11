import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { prepareWorldMessage } from '@/lib/services/world';

/** Translates and flags a line. Does not store it and does not send it to the other person. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  rateLimit(`world-msg:${user.id}`, 40, 60_000);
  const b = await parseBody(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  return json({ message: await prepareWorldMessage(user, id, b.text) });
});
