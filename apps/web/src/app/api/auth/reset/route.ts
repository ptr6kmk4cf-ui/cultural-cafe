import { z } from 'zod';
import { applyPasswordReset } from '@/lib/auth-reset';
import { json, parseBody, route } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const Body = z.object({
  token: z.string().trim().min(16).max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
});

export const POST = route(async (req) => {
  await rateLimit(`reset:${clientIp(req)}`, 12, 60 * 60_000);
  const body = await parseBody(req, Body);
  await applyPasswordReset(body.token, body.password);
  return json({ ok: true });
});
