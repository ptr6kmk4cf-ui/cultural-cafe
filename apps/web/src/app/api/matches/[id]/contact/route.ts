import { requireUser } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, notFound, route } from '@/lib/http';
import { createContact, serializeContact } from '@/lib/services/contacts';

/** Promote a shortlisted match to a contact (idempotent; never creates duplicates). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const match = await db.matchCandidate.findFirst({ where: { id, userId: user.id } });
  if (!match) throw notFound();
  let contact = await db.contact.findFirst({
    where: { userId: user.id, platform: match.platform, externalId: match.externalId },
  });
  if (!contact) {
    contact = await createContact(user, {
      name: match.name,
      platform: match.platform,
      externalId: match.externalId,
      profileNotes: decrypt(match.summary),
      source: 'MATCH',
    });
  }
  await db.matchCandidate.update({ where: { id }, data: { status: 'CONTACTED', contactId: contact.id } });
  return json({ contact: serializeContact(contact) });
});
