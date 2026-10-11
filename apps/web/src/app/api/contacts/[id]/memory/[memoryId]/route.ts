import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, notFound, parseBody, route } from '@/lib/http';
import { getOwnedContact, serializeMemory } from '@/lib/services/contacts';
import { zMemoryKind } from '@/lib/validation';

type P = { id: string; memoryId: string };

async function owned(userId: string, id: string, memoryId: string) {
  await getOwnedContact(userId, id);
  const m = await db.memoryItem.findFirst({ where: { id: memoryId, contactId: id } });
  if (!m) throw notFound();
  return m;
}

export const PATCH = route<P>(async (req, { id, memoryId }) => {
  const user = await requireUser(req);
  await owned(user.id, id, memoryId);
  const b = await parseBody(
    req,
    z.object({ kind: zMemoryKind.optional(), content: z.string().trim().min(1).max(300).optional(), resolved: z.boolean().optional() }),
  );
  const m = await db.memoryItem.update({
    where: { id: memoryId },
    data: { ...b, ...(b.content ? { content: encrypt(b.content), source: 'USER' as const } : {}) },
  });
  return json({ memory: serializeMemory(m) });
});

export const DELETE = route<P>(async (req, { id, memoryId }) => {
  const user = await requireUser(req);
  await owned(user.id, id, memoryId);
  await db.memoryItem.delete({ where: { id: memoryId } });
  return json({ ok: true });
});
