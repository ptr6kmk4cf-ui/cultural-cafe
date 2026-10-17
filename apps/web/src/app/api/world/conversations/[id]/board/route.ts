import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { loadCafeBoard, saveCafeBoard } from '@/lib/services/cafe-board';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  return json(await loadCafeBoard(user, id));
});

export const PUT = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await rateLimit(`board-save:${user.id}`, 40, 60_000);
  const body = await parseBody(
    req,
    z.object({
      version: z.number().int().min(0).max(1_000_000),
      elements: z.array(z.unknown()).max(250),
    }),
  );
  const saved = await saveCafeBoard(user, id, body.version, body.elements);
  return json(saved, saved.conflict ? 409 : 200);
});
