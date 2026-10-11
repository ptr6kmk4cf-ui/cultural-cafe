import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { loadPersona } from '@/lib/ai/persona';
import { generateReply } from '@/lib/ai/tasks';
import { json, parseBody, route } from '@/lib/http';
import { zLang, zMode, zStyle } from '@/lib/validation';

/**
 * One-off reply help without creating a contact: nothing is stored except the
 * usage counter. Use a contact for memory and continuity.
 */
const Body = z.object({
  name: z.string().trim().max(80).default('Them'),
  conversation: z
    .array(z.object({ direction: z.enum(['IN', 'OUT']), text: z.string().max(4000) }))
    .min(1)
    .max(30),
  mode: zMode.optional(),
  language: zLang.optional(),
  style: zStyle.nullable().optional(),
  instruction: z.string().max(400).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, Body);
  const { persona, lang } = await loadPersona(user.id);
  const r = await generateReply({
    user,
    persona,
    myLanguage: lang.myLanguage,
    mode: b.mode ?? lang.defaultMode,
    targetLanguage: b.language ?? lang.defaultReplyLanguage,
    contact: { name: b.name || 'Them', notes: '', objective: '', style: b.style ?? null },
    memory: [],
    history: b.conversation,
    photos: [],
    sharedPhotoIds: [],
    instruction: b.instruction,
  });
  return json({
    suggestions: r.suggestions,
    detectedLanguage: r.detectedLanguage,
    replyLanguage: r.replyLanguage,
    incomingTranslation: r.incomingTranslation ?? null,
    intent: r.intent,
    needsUserInput: r.needsUserInput ?? null,
    mockAi: r.mock,
  });
});
