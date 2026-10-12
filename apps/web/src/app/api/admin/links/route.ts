import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { json, parseBody, route } from '@/lib/http';
import { adminClearConnection, adminEndConversation, listLiveLinks } from '@/lib/services/world';

/** Live café links for an admin. Chat text and connection payloads are not included. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ links: await listLiveLinks() });
});

export const POST = route(async (req) => {
  await requireAdmin(req);
  const b = await parseBody(
    req,
    z.object({
      conversationId: z.string().min(1).max(40),
      action: z.enum(['end', 'clear']),
    }),
  );
  if (b.action === 'end') await adminEndConversation(b.conversationId);
  else await adminClearConnection(b.conversationId);
  return json({ links: await listLiveLinks() });
});
