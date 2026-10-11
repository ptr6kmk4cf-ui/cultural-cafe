import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE, requireUser, verifyPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { storage } from '@/lib/storage';

/** Permanently deletes the account and ALL associated data (GDPR right to erasure). */
export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  const { password, confirm } = await parseBody(req, z.object({ password: z.string(), confirm: z.literal('DELETE') }));
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(password, full.passwordHash))) throw new HttpError(401, 'Incorrect password');
  void confirm;
  const photos = await db.photo.findMany({ where: { userId: user.id }, select: { storageKey: true } });
  await db.worldMessage.deleteMany({ where: { conversation: { OR: [{ userAId: user.id }, { userBId: user.id }] } } });
  await db.worldConversation.deleteMany({ where: { OR: [{ userAId: user.id }, { userBId: user.id }] } });
  await db.user.delete({ where: { id: user.id } }); // cascades to every user-owned table
  await Promise.all(photos.map((p) => storage.delete(p.storageKey)));
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});

export const PATCH = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60) }));
  await db.user.update({ where: { id: user.id }, data: { name: b.name } });
  return json({ ok: true });
});
