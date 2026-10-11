import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { addMessage, getOwnedContact, serializeMessage } from '@/lib/services/contacts';

const Body = z.object({
  direction: z.enum(['IN', 'OUT']),
  text: z.string().max(4000).default(''),
  translatedText: z.string().max(4000).nullable().optional(),
  language: z.string().max(5).nullable().optional(),
  aiGenerated: z.boolean().optional(),
  photoId: z.string().max(40).nullable().optional(),
});

/** Log a message in a manual conversation (pasted incoming message or the reply the user sent). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const contact = await getOwnedContact(user.id, id);
  const b = await parseBody(req, Body);
  if (!b.text && !b.photoId) throw new HttpError(422, 'Message is empty');
  if (b.direction === 'OUT' && contact.doNotContact) {
    throw new HttpError(409, `${contact.name} asked not to be contacted. Clear "do not contact" first if this was a mistake.`, 'do_not_contact');
  }
  if (b.photoId) {
    const photo = await db.photo.findFirst({ where: { id: b.photoId, userId: user.id } });
    if (!photo) throw new HttpError(404, 'Photo not found');
  }
  const msg = await addMessage(id, b);
  return json({ message: serializeMessage(msg) }, 201);
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await getOwnedContact(user.id, id);
  const messageId = req.nextUrl.searchParams.get('messageId');
  await db.message.deleteMany({ where: { contactId: id, ...(messageId ? { id: messageId } : {}) } });
  return json({ ok: true });
});
