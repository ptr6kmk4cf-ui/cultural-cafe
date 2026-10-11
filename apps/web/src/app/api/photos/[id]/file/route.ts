import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound, route } from '@/lib/http';
import { storage } from '@/lib/storage';

/** Authenticated, ownership-checked image delivery (never a public URL). */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const photo = await db.photo.findFirst({ where: { id, userId: user.id } });
  if (!photo) throw notFound();
  const data = await storage.get(photo.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': photo.mimeType,
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  });
});
