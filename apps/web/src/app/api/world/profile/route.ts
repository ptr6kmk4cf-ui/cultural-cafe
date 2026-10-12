import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { json, parseBody, route, HttpError } from '@/lib/http';
import { getOrCreateProfile, newInviteCode, serializeProfile, touchPresence, tryOfferFriendHours } from '@/lib/services/world';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json({ profile: serializeProfile(await getOrCreateProfile(user.id)) });
});

const Body = z.object({
  optedIn: z.boolean().optional(),
  available: z.boolean().optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(400).optional(),
  portraitPhotoId: z.string().nullable().optional(),
});

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, Body);
  if (b.portraitPhotoId) {
    const photo = await db.photo.findFirst({ where: { id: b.portraitPhotoId, userId: user.id } });
    if (!photo) throw new HttpError(400, 'Choose a photo from your library.');
    if (photo.category === 'PRIVATE') throw new HttpError(400, 'Private photos cannot be used as a World portrait.');
  }
  const data: Record<string, unknown> = { lastSeenAt: new Date() };
  if (b.optedIn !== undefined) data.optedIn = b.optedIn;
  if (b.available !== undefined) {
    data.available = b.available;
    if (!b.available) data.queuedAt = null;
  }
  if (b.city !== undefined) data.city = b.city;
  if (b.country !== undefined) data.country = b.country;
  if (b.bio !== undefined) data.bio = encrypt(b.bio);
  if (b.portraitPhotoId !== undefined) data.portraitPhotoId = b.portraitPhotoId;
  if (b.optedIn === false) {
    data.available = false;
    data.queuedAt = null;
  }
  await db.worldProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, inviteCode: newInviteCode(), ...data },
  });
  if (b.available !== undefined) await touchPresence(user.id, b.available);
  if (b.optedIn) await tryOfferFriendHours(user.id, { includeInvitees: true });
  const profile = await getOrCreateProfile(user.id);
  return json({ profile: serializeProfile(profile) });
});
