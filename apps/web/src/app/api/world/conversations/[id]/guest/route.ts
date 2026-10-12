import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { replyAsCafeGuest } from '@/lib/services/cafe-guests';

const Body = z.object({
  history: z.array(z.object({
    mine: z.boolean(),
    text: z.string().max(500),
    translation: z.string().max(500).nullable().optional(),
  })).max(12).default([]),
});

/** A café guest answers. The line is not written to the database. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  rateLimit(`world-guest:${user.id}`, 40, 60_000);
  const b = await parseBody(req, Body);
  const result = await replyAsCafeGuest(user.id, id, b.history);
  return json({ message: result.message, closed: result.closed });
});
