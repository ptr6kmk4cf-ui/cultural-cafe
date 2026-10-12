import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { detectSensitiveRequest, detectStopRequest } from '@/lib/ai/safety';
import { generateWorldReply, WORLD_AI_DISCLOSURE } from '@/lib/ai/tasks';
import { loadPersona } from '@/lib/ai/persona';
import { json, parseBody, route } from '@/lib/http';
import { assertWorldAutomation } from '@/lib/plans';
import { rateLimit } from '@/lib/rate-limit';
import { hardcodedTableReply } from '@/lib/services/cafe-guests';
import { tablePromptFor } from '@/lib/services/cafe-topics';
import { requireParticipant, peerId, publicCard } from '@/lib/services/world';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const b = await parseBody(
    req,
    z.object({
      history: z
        .array(
          z.object({
            mine: z.boolean(),
            text: z.string().transform((s) => s.slice(0, 2000)),
          }),
        )
        .max(400),
      auto: z.boolean().optional(),
    }),
  );
  rateLimit(`world-assist:${user.id}`, 20, 60_000);
  await assertWorldAutomation(user.id, user.plan, b.auto ? 'autopilot' : 'assist');
  const conv = await requireParticipant(user.id, id);
  if (conv.status !== 'ACTIVE' || conv.endsAt < new Date()) {
    return json({ error: 'This table has closed.', code: 'ended' }, 409);
  }
  const otherId = await peerId(conv, user.id);
  const other = await db.user.findUnique({ where: { id: otherId }, select: { synthetic: true } });
  if (other?.synthetic) {
    const history = b.history.slice(-24);
    const latest = [...history].reverse().find((m) => !m.mine)?.text ?? '';
    const stop = !!latest && (detectStopRequest(latest) || detectSensitiveRequest(latest));
    const line = stop ? null : hardcodedTableReply(history.filter((m) => m.mine).map((m) => m.text), latest);
    return json({
      text: line ?? '',
      hold: !line,
      holdReason: line
        ? null
        : stop
          ? 'They asked to stop. Take over and say goodbye yourself.'
          : 'Answering stopped. The lines for this table are used up.',
      disclosure: WORLD_AI_DISCLOSURE,
      mockAi: false,
    });
  }
  const { persona, lang } = await loadPersona(user.id);
  const peer = await publicCard(otherId, user.id);
  const mine = await db.worldProfile.findUnique({ where: { userId: user.id } });
  const r = await generateWorldReply({
    user,
    persona,
    myLanguage: lang.myLanguage,
    peerName: peer?.name ?? '',
    peerCity: [peer?.city, peer?.country].filter(Boolean).join(', '),
    myCity: [mine?.city, mine?.country].filter(Boolean).join(', '),
    prompt: (await tablePromptFor(conv)).question,
    history: b.history.slice(-24),
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
