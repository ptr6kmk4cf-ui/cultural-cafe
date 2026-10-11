import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { prepareWorldMessage } from '@/lib/services/world';

/** Translates a line, stores it until the hour ends, and returns it to the café chat. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  rateLimit(`world-msg:${user.id}`, 40, 60_000);
  const b = await parseBody(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  return json({ message: await prepareWorldMessage(user, id, b.text) });
});
