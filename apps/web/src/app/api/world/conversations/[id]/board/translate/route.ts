import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { translateCafeBoard } from '@/lib/services/cafe-board';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await rateLimit(`board-translate:${user.id}`, 20, 60_000);
  const body = await parseBody(req, z.object({ elements: z.array(z.unknown()).max(250) }));
  return json(await translateCafeBoard(user, id, body.elements));
});
