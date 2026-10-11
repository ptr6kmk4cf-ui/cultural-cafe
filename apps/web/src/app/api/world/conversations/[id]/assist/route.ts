import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { generateWorldReply, WORLD_AI_DISCLOSURE } from '@/lib/ai/tasks';
import { loadPersona } from '@/lib/ai/persona';
import { json, parseBody, route } from '@/lib/http';
import { assertWorldAutomation } from '@/lib/plans';
import { rateLimit } from '@/lib/rate-limit';
import { requireParticipant, peerId, publicCard } from '@/lib/services/world';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const b = await parseBody(
    req,
    z.object({
      history: z.array(z.object({ mine: z.boolean(), text: z.string().max(2000) })).max(30),
      auto: z.boolean().optional(),
    }),
  );
  await requireParticipant(user.id, id);
  rateLimit(`world-assist:${user.id}`, 20, 60_000);
  await assertWorldAutomation(user.id, user.plan, b.auto ? 'autopilot' : 'assist');
  const conv = await requireParticipant(user.id, id);
  if (conv.status !== 'ACTIVE' || conv.endsAt < new Date()) {
    return json({ error: 'This hour is over.', code: 'ended' }, 409);
  }
  const { persona, lang } = await loadPersona(user.id);
  const peer = await publicCard(await peerId(conv, user.id), user.id);
  const r = await generateWorldReply({
    user,
    persona,
    myLanguage: lang.myLanguage,
    peerName: peer?.name ?? '',
    peerCity: [peer?.city, peer?.country].filter(Boolean).join(', '),
    history: b.history,
    auto: !!b.auto,
  });
  return json({
    text: r.text,
    hold: r.hold,
    holdReason: r.holdReason,
    disclosure: WORLD_AI_DISCLOSURE,
    mockAi: r.mock,
  });
});
