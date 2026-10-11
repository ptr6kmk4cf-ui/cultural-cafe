import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { respondInvite } from '@/lib/services/world';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const b = await parseBody(req, z.object({ accept: z.boolean() }));
  return json(await respondInvite(user, id, b.accept));
});
