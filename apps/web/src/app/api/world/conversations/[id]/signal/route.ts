import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { postSignal, pullSignals } from '@/lib/services/world';

const TYPES = ['offer', 'answer', 'ice'] as const;

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const after = req.nextUrl.searchParams.get('after') ?? undefined;
  return json({ signals: await pullSignals(user.id, id, after) });
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  rateLimit(`world-signal:${user.id}`, 400, 60_000);
  const b = await parseBody(
    req,
    z.object({
      type: z.enum(TYPES),
      payload: z.string().min(1).max(16_000),
    }),
  );
  const row = await postSignal(user.id, id, b.type, b.payload);
  return json({ id: row.id }, 201);
});
