import { z } from 'zod';
import { sendPasswordReset } from '@/lib/auth-reset';
import { json, parseBody, route } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

export const POST = route(async (req) => {
  await rateLimit(`forgot:${clientIp(req)}`, 8, 60 * 60_000);
  const body = await parseBody(req, Body);
  await rateLimit(`forgot-email:${body.email}`, 5, 60 * 60_000);
  return json(await sendPasswordReset(body.email));
});
