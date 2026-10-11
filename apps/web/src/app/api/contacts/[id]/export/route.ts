import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { route } from '@/lib/http';
import { getOwnedContact, serializeContact, serializeMemory, serializeMessage } from '@/lib/services/contacts';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const contact = await getOwnedContact(user.id, id);
  const [messages, memories] = await Promise.all([
    db.message.findMany({ where: { contactId: id }, orderBy: { sentAt: 'asc' } }),
    db.memoryItem.findMany({ where: { contactId: id } }),
  ]);
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), contact: serializeContact(contact), memories: memories.map(serializeMemory), messages: messages.map(serializeMessage) },
    null,
    2,
  );
  const safeName = contact.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'contact';
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="conversa-${safeName}.json"`,
    },
  });
});
