import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound, route } from '@/lib/http';
import { storage } from '@/lib/storage';
import { isBlocked } from '@/lib/services/world';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const profile = await db.worldProfile.findUnique({ where: { userId: id } });
  if (!profile?.optedIn || !profile.portraitPhotoId) throw notFound();
  if (await isBlocked(user.id, id)) throw notFound();
  const photo = await db.photo.findFirst({ where: { id: profile.portraitPhotoId, userId: id, category: { not: 'PRIVATE' } } });
  if (!photo) throw notFound();
  const data = await storage.get(photo.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': photo.mimeType,
      'cache-control': 'private, max-age=120',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  });
});
