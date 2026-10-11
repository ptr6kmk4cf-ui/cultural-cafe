import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { translateText } from '@/lib/ai/tasks';
import { json, parseBody, route } from '@/lib/http';
import { zLang } from '@/lib/validation';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, z.object({ text: z.string().trim().min(1).max(4000), target: zLang }));
  return json(await translateText(user, b.text, b.target));
});
