import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, notFound, parseBody, route } from '@/lib/http';
import { getOwnedContact } from '@/lib/services/contacts';

/** Records that the user sent this photo to a contact (memory: "previously shared photos"). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const { contactId } = await parseBody(req, z.object({ contactId: z.string().max(40) }));
  const photo = await db.photo.findFirst({ where: { id, userId: user.id } });
  if (!photo) throw notFound();
  await getOwnedContact(user.id, contactId);
  await db.memoryItem.create({ data: { contactId, kind: 'PHOTO_SHARED', content: encrypt(photo.id), source: 'USER' } });
  return json({ ok: true });
});
