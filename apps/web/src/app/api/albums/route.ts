import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const albums = await db.album.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { photos: true } } },
  });
  return json({ albums: albums.map((a) => ({ id: a.id, name: a.name, photoCount: a._count.photos })) });
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const album = await db.album.create({ data: { userId: user.id, name } });
  return json({ album: { id: album.id, name: album.name, photoCount: 0 } }, 201);
});
