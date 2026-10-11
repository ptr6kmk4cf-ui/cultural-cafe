import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, notFound, parseBody, route } from '@/lib/http';
import { storage } from '@/lib/storage';
import { PHOTO_CATEGORIES, serializePhoto } from '@/lib/services/photos';

type P = { id: string };

async function owned(userId: string, id: string) {
  const p = await db.photo.findFirst({ where: { id, userId } });
  if (!p) throw notFound();
  return p;
}

const Patch = z.object({
  caption: z.string().max(300).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
  category: z.enum(PHOTO_CATEGORIES).optional(),
  aiApproved: z.boolean().optional(),
  albumId: z.string().max(40).nullable().optional(),
});

export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  const current = await owned(user.id, id);
  const b = await parseBody(req, Patch);
  if (b.albumId && !(await db.album.findFirst({ where: { id: b.albumId, userId: user.id } }))) throw new HttpError(404, 'Album not found');
  const category = b.category ?? current.category;
  const photo = await db.photo.update({
    where: { id },
    data: { ...b, aiApproved: category === 'PRIVATE' ? false : (b.aiApproved ?? current.aiApproved) },
  });
  return json({ photo: serializePhoto(photo) });
});

export const DELETE = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  const p = await owned(user.id, id);
  await db.photo.delete({ where: { id } });
  await storage.delete(p.storageKey);
  return json({ ok: true });
});
