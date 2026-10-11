import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, route } from '@/lib/http';
import { PLAN_LIMITS } from '@/lib/plans';
import { rateLimit } from '@/lib/rate-limit';
import { MAX_UPLOAD_BYTES, processUpload } from '@/lib/storage';
import { PHOTO_CATEGORIES, serializePhoto } from '@/lib/services/photos';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const approvedOnly = req.nextUrl.searchParams.get('approved') === '1';
  const albumId = req.nextUrl.searchParams.get('albumId');
  const photos = await db.photo.findMany({
    where: {
      userId: user.id,
      ...(approvedOnly ? { aiApproved: true, category: { not: 'PRIVATE' } } : {}),
      ...(albumId ? { albumId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return json({ photos: photos.map(serializePhoto) });
});

const Meta = z.object({
  albumId: z.string().max(40).optional().nullable(),
  caption: z.string().max(300).default(''),
  tags: z.string().max(400).default(''),
  category: z.enum(PHOTO_CATEGORIES).default('GENERAL'),
  aiApproved: z.enum(['true', 'false']).default('false'),
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`upload:${user.id}`, 30, 10 * 60_000);
  const count = await db.photo.count({ where: { userId: user.id } });
  if (count >= PLAN_LIMITS[user.plan].maxPhotos) throw new HttpError(402, 'Photo limit reached for your plan', 'photo_limit');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(422, 'No file uploaded');
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Photo is larger than 10 MB');
  const meta = Meta.parse({
    albumId: form.get('albumId') || null,
    caption: form.get('caption') ?? '',
    tags: form.get('tags') ?? '',
    category: form.get('category') || 'GENERAL',
    aiApproved: form.get('aiApproved') || 'false',
  });
  if (meta.albumId && !(await db.album.findFirst({ where: { id: meta.albumId, userId: user.id } }))) {
    throw new HttpError(404, 'Album not found');
  }

  const stored = await processUpload(user.id, Buffer.from(await file.arrayBuffer()));
  const photo = await db.photo.create({
    data: {
      userId: user.id,
      albumId: meta.albumId || null,
      ...stored,
      caption: meta.caption,
      tags: [...new Set(meta.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
      category: meta.category,
      // Private photos can never be approved for AI suggestions.
      aiApproved: meta.category !== 'PRIVATE' && meta.aiApproved === 'true',
    },
  });
  return json({ photo: serializePhoto(photo) }, 201);
});
