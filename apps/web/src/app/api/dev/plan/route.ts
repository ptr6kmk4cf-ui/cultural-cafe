import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';

/** DEV ONLY: switch plan without Stripe, for local testing. Disabled unless DEV_TOOLS=true and not production. */
export const POST = route(async (req) => {
  if (process.env.NODE_ENV === 'production' || process.env.DEV_TOOLS !== 'true') throw new HttpError(404, 'Not found');
  const user = await requireUser(req);
  const { plan } = await parseBody(req, z.object({ plan: z.enum(['FREE', 'PREMIUM']) }));
  await db.user.update({ where: { id: user.id }, data: { plan } });
  return json({ ok: true, plan });
});
