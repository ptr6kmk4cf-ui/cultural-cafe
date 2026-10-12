import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { releaseCafeLink, touchCafeLink } from '@/lib/services/world';

/** Presence for the live link. Closing the hour deletes that person's connection data. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  rateLimit(`world-link:${user.id}`, 120, 60_000);
  const b = await parseBody(
    req,
    z.object({
      release: z.boolean().optional(),
      phase: z.enum(['connecting', 'open', 'restarting']).optional(),
    }),
  );
  if (b.release) {
    await releaseCafeLink(user.id, id);
    return json({ ok: true });
  }
  await touchCafeLink(user.id, id, b.phase ?? 'connecting');
  return json({ ok: true });
});
