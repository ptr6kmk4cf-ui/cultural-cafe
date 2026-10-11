import { z } from 'zod';
import { MAX_PREFERRED_LANGUAGES } from '@conversa/shared';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { zLang, zMode } from '@/lib/validation';

const Body = z.object({
  myLanguage: zLang,
  defaultReplyLanguage: zLang,
  defaultMode: zMode,
  preferredLanguages: z.array(zLang).max(MAX_PREFERRED_LANGUAGES).transform((a) => [...new Set(a)]),
});

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const data = await parseBody(req, Body);
  await db.languageSettings.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  return json({ ok: true });
});
