import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { getOwnedContact, serializeContact, serializeMemory, serializeMessage } from '@/lib/services/contacts';
import { zLang, zMode, zStyle } from '@/lib/validation';

type P = { id: string };

export const GET = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  const contact = await getOwnedContact(user.id, id);
  const [messages, memories] = await Promise.all([
    db.message.findMany({ where: { contactId: id }, orderBy: { sentAt: 'asc' }, take: 500 }),
    db.memoryItem.findMany({ where: { contactId: id }, orderBy: { createdAt: 'desc' } }),
  ]);
  return json({
    contact: serializeContact(contact),
    messages: messages.map(serializeMessage),
    memories: memories.map(serializeMemory),
  });
});

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  profileNotes: z.string().max(4000).optional(),
  objective: z.string().max(300).optional(),
  language: zLang.nullable().optional(),
  languageMode: zMode.nullable().optional(),
  style: zStyle.nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  doNotContact: z.boolean().optional(),
  humanTakeover: z.boolean().optional(),
  autopilotAllowed: z.boolean().optional(),
});

export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  await getOwnedContact(user.id, id);
  const b = await parseBody(req, Patch);
  const updated = await db.contact.update({
    where: { id },
    data: { ...b, ...(b.profileNotes !== undefined ? { profileNotes: encrypt(b.profileNotes) } : {}) },
  });
  return json({ contact: serializeContact(updated) });
});

export const DELETE = route<P>(async (req, { id }) => {
  const user = await requireUser(req);
  await getOwnedContact(user.id, id);
  await db.matchCandidate.deleteMany({ where: { userId: user.id, contactId: id } });
  await db.contact.delete({ where: { id } });
  return json({ ok: true });
});
