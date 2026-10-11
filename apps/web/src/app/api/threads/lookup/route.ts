import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { assertCapability } from '@/lib/platform';
import { serializeContact, syncThread } from '@/lib/services/contacts';
import { zThreadSnapshot } from '@/lib/validation';

/** Returns the tracked contact for an open thread (and syncs new messages), or null if not tracked. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { snapshot, track } = await parseBody(req, z.object({ snapshot: zThreadSnapshot, track: z.boolean().default(false) }));
  assertCapability(snapshot.platform, 'readConversation');
  const res = await syncThread(user, snapshot, { create: track });
  return json({ contact: res ? serializeContact(res.contact) : null, added: res?.added ?? 0 });
});
