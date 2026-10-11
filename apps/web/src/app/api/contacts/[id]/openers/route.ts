import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { loadPersona } from '@/lib/ai/persona';
import { generateOpeners } from '@/lib/ai/tasks';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { getOwnedContact } from '@/lib/services/contacts';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const contact = await getOwnedContact(user.id, id);
  if (contact.doNotContact) throw new HttpError(409, `${contact.name} asked not to be contacted.`, 'do_not_contact');
  const b = await parseBody(req, z.object({ avoid: z.array(z.string().max(800)).max(9).default([]) }));
  const { persona, lang } = await loadPersona(user.id);
  const match = await db.matchCandidate.findFirst({ where: { userId: user.id, contactId: id } });
  const result = await generateOpeners({
    myLanguage: lang.myLanguage,
    user,
    persona,
    profile: {
      name: contact.name,
      notes: decrypt(contact.profileNotes),
      bio: match ? decrypt(match.summary) : null,
    },
    language: contact.language ?? lang.defaultReplyLanguage,
    objective: contact.objective,
    style: contact.style,
    avoid: b.avoid,
  });
  return json(result);
});
