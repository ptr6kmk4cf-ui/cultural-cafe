import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { joinQueue, leaveQueue } from '@/lib/services/world';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`world-queue:${user.id}`, 30, 60_000);
  rateLimit(`world-queue-ip:${clientIp(req)}`, 60, 60_000);
  const b = await parseBody(req, z.object({ action: z.enum(['join', 'leave']) }));
  if (b.action === 'leave') {
    await leaveQueue(user.id);
    return json({ state: 'idle' });
  }
  return json(await joinQueue(user));
});
