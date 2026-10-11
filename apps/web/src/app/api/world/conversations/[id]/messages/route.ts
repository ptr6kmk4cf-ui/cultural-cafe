import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { requireParticipant } from '@/lib/services/world';

/** Live World chat is WebRTC peer-to-peer. The server no longer carries messages. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await requireParticipant(user.id, id);
  return json(
    {
      error: 'World messages travel directly between the two browsers (WebRTC). Open the live chat page.',
      code: 'p2p_only',
    },
    410,
  );
});
