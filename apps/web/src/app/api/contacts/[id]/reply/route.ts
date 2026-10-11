import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { addMessage, getOwnedContact } from '@/lib/services/contacts';
import { replyForContact } from '@/lib/services/reply';

const Body = z.object({
  /** A new incoming message pasted by the user (manual mode). */
  incoming: z.string().max(4000).optional(),
  /** Store the pasted incoming message in the history. */
  saveIncoming: z.boolean().default(true),
  instruction: z.string().max(400).optional(),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const contact = await getOwnedContact(user.id, id);
  const b = await parseBody(req, Body);
  const incoming = b.incoming?.trim();
  if (incoming && b.saveIncoming) await addMessage(id, { direction: 'IN', text: incoming });
  const result = await replyForContact(user, contact, {
    extraIncoming: incoming && !b.saveIncoming ? incoming : null,
    instruction: b.instruction,
  });
  const { raw: _raw, ...rest } = result;
  return json(rest);
});
