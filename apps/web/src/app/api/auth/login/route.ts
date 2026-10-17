import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, hashPassword, setSessionCookie, verifyPassword } from '@/lib/auth';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

// Constant-cost dummy hash so unknown emails take as long as wrong passwords.
let dummyHash: Promise<string> | null = null;

export const POST = route(async (req) => {
  await rateLimit(`login:${clientIp(req)}`, 20, 15 * 60_000);
  const body = await parseBody(req, Body);
  await rateLimit(`login-email:${body.email}`, 8, 15 * 60_000);
  const user = await db.user.findUnique({ where: { email: body.email } });
  dummyHash ??= hashPassword('conversa-timing-equaliser');
  const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
  if (!user || user.synthetic || !ok) throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
  const { token, maxAge } = await createSession(user.id, 'WEB');
  await setSessionCookie(token, maxAge);
  return json({ ok: true });
});
