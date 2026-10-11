import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { assertCapability } from '@/lib/platform';
import { serializeContact, syncThread } from '@/lib/services/contacts';
import { replyForContact } from '@/lib/services/reply';
import { zThreadSnapshot } from '@/lib/validation';

/** Sync the open thread and generate reply suggestions (Mode A / B). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, z.object({ snapshot: zThreadSnapshot, instruction: z.string().max(400).optional() }));
  assertCapability(b.snapshot.platform, 'readConversation');
  const synced = await syncThread(user, b.snapshot, { create: true });
  const contact = synced!.contact;
  const result = await replyForContact(user, contact, { instruction: b.instruction });
  const { raw: _raw, ...rest } = result;
  return json({ ...rest, contact: serializeContact({ ...contact, doNotContact: contact.doNotContact || result.intent.stopRequested }) });
});
