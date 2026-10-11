import { cookies } from 'next/headers';
import { SESSION_COOKIE, destroySessionByToken } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const POST = route(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySessionByToken(token);
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
