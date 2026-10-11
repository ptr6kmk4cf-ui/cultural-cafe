import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { loadPersona } from '@/lib/ai/persona';
import { generateOpeners } from '@/lib/ai/tasks';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { assertCapability } from '@/lib/platform';
import { zLang, zProfileInput } from '@/lib/validation';

/**
 * Openers for a profile the user is viewing. Nothing about the profile is stored
 * here; it is only persisted if the user shortlists it or sends a message.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(
    req,
    z.object({
      platform: z.string(),
      profile: zProfileInput,
      language: zLang.optional(),
      avoid: z.array(z.string().max(800)).max(9).default([]),
    }),
  );
  assertCapability(b.platform, 'discovery');
  const existing = await db.contact.findFirst({
    where: { userId: user.id, platform: b.platform, externalId: b.profile.externalId },
    include: { _count: { select: { messages: { where: { direction: 'OUT' } } } } },
  });
  const { persona, lang } = await loadPersona(user.id);
  const language = b.language ?? existing?.language ?? (b.profile.language && b.profile.language !== lang.myLanguage && lang.defaultMode !== 'SELECTED' ? b.profile.language : lang.defaultReplyLanguage);
  const result = await generateOpeners({
    myLanguage: lang.myLanguage,
    user,
    persona,
    profile: { ...b.profile, notes: null },
    language,
    objective: existing?.objective,
    avoid: b.avoid,
  });
  return json({
    ...result,
    language,
    alreadyContacted: (existing?._count.messages ?? 0) > 0,
    doNotContact: existing?.doNotContact ?? false,
  });
});
