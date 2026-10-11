import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, notFound, parseBody, route } from '@/lib/http';
import { storage } from '@/lib/storage';

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const res = await db.album.updateMany({ where: { id, userId: user.id }, data: { name } });
  if (!res.count) throw notFound();
  return json({ ok: true });
});

/** ?withPhotos=1 also deletes the photos in the album; otherwise they move to "unsorted". */
export const DELETE = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  const album = await db.album.findFirst({ where: { id, userId: user.id }, include: { photos: true } });
  if (!album) throw notFound();
  if (req.nextUrl.searchParams.get('withPhotos') === '1') {
    await db.photo.deleteMany({ where: { albumId: id, userId: user.id } });
    await Promise.all(album.photos.map((p) => storage.delete(p.storageKey)));
  }
  await db.album.delete({ where: { id } });
  return json({ ok: true });
});
