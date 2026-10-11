import { z } from 'zod';
import { createSession, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';

/**
 * Issues a long-lived, revocable token for the browser extension.
 * Only a signed-in web session can mint one (the extension never sees the password).
 */
export const POST = route(async (req) => {
  if (req.headers.get('authorization')) throw new HttpError(403, 'Extension tokens can only be created from the web app');
  const user = await requireUser(req);
  const { label } = await parseBody(req, z.object({ label: z.string().max(80).default('Chrome extension') }));
  const { token } = await createSession(user.id, 'EXTENSION', label);
  return json({ token });
});

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const sessions = await db.session.findMany({
    where: { userId: user.id, kind: 'EXTENSION', expiresAt: { gt: new Date() } },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return json({ sessions });
});

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  const id = req.nextUrl.searchParams.get('id');
  await db.session.deleteMany({ where: { userId: user.id, kind: 'EXTENSION', ...(id ? { id } : {}) } });
  return json({ ok: true });
});
