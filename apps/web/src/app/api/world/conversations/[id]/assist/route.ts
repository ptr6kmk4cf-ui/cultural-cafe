import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { detectSensitiveRequest, detectStopRequest } from '@/lib/ai/safety';
import { generateWorldReply, translateText, WORLD_AI_DISCLOSURE } from '@/lib/ai/tasks';
import { loadPersona } from '@/lib/ai/persona';
import { json, parseBody, route } from '@/lib/http';
import { assertWorldAutomation } from '@/lib/plans';
import { rateLimit } from '@/lib/rate-limit';
import { tablePromptFor } from '@/lib/services/cafe-topics';
import { draftNeedsTranslation } from '@/lib/ai/lang';
import { draftEchoes, lineWorthReading, replyAboutTheirLine, staysOnTable } from '@/lib/table-reply';
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
      inTheirLanguage: z.boolean().optional(),
    }),
  );
  rateLimit(`world-assist:${user.id}`, 20, 60_000);
  await assertWorldAutomation(user.id, user.plan, b.auto ? 'autopilot' : 'assist');
  const conv = await requireParticipant(user.id, id);
  if (conv.status !== 'ACTIVE' || conv.endsAt < new Date()) {
    return json({ error: 'This table has closed.', code: 'ended' }, 409);
  }
  const otherId = await peerId(conv, user.id);
  const { persona, lang } = await loadPersona(user.id);
  const peer = await publicCard(otherId, user.id);
  const mine = await db.worldProfile.findUnique({ where: { userId: user.id } });
  const history = b.history.slice(-24);
  const topic = (await tablePromptFor(conv)).question;
  const place = [mine?.city, mine?.country].filter(Boolean).join(', ');
  const theirs = history.filter((m) => !m.mine).map((m) => m.text);
  const latestRaw = [...theirs].reverse()[0] ?? '';
  const worth = lineWorthReading(theirs);
  const blocked = !!latestRaw && (detectStopRequest(latestRaw) || detectSensitiveRequest(latestRaw));
  const writeLang =
    b.inTheirLanguage && peer?.language && peer.language !== lang.myLanguage ? peer.language : lang.myLanguage;
  const r = await generateWorldReply({
    user,
    persona,
    myLanguage: writeLang,
    peerName: peer?.name ?? '',
    peerCity: [peer?.city, peer?.country].filter(Boolean).join(', '),
    myCity: place,
    prompt: topic,
    history,
    auto: !!b.auto,
  });
  let text = r.text.trim();
  if (
    writeLang === lang.myLanguage &&
    !blocked &&
    (draftEchoes(text, worth, topic) || !staysOnTable(text, worth, topic))
  ) {
    text = replyAboutTheirLine({ latest: worth, topic, place });
  }
  if (!blocked && (!text || draftNeedsTranslation(text, writeLang))) {
    const fallback = replyAboutTheirLine({ latest: worth, topic, place });
    const t = await translateText(user, fallback, writeLang).catch(() => null);
    const next = t?.translation?.replace(/\s+/g, ' ').trim();
    if (next && !draftNeedsTranslation(next, writeLang)) text = next;
    else if (writeLang === lang.myLanguage && !draftNeedsTranslation(fallback, writeLang)) text = fallback;
    else text = '';
  }
  if (!blocked && text && draftNeedsTranslation(text, writeLang)) text = '';
  return json({
    text,
    hold: blocked || !text,
    holdReason: blocked ? r.holdReason : !text ? 'Could not write that line. You can write this one.' : null,
    disclosure: WORLD_AI_DISCLOSURE,
    mockAi: r.mock,
  });
});
