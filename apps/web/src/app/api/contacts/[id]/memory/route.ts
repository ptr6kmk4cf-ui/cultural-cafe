import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { getOwnedContact, serializeMemory } from '@/lib/services/contacts';
import { zMemoryKind } from '@/lib/validation';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await getOwnedContact(user.id, id);
  const b = await parseBody(req, z.object({ kind: zMemoryKind, content: z.string().trim().min(1).max(300) }));
  const m = await db.memoryItem.create({ data: { contactId: id, kind: b.kind, content: encrypt(b.content), source: 'USER' } });
  return json({ memory: serializeMemory(m) }, 201);
});

/** Clear all memory for this contact. */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await getOwnedContact(user.id, id);
  await db.memoryItem.deleteMany({ where: { contactId: id } });
  return json({ ok: true });
});
