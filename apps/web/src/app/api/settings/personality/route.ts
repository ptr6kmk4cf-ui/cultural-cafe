import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { zStyle, zTagList } from '@/lib/validation';

const Body = z.object({
  displayName: z.string().trim().min(1).max(60),
  aboutMe: z.string().max(2000).default(''),
  interests: zTagList(),
  intentions: z.string().max(300).default(''),
  personality: z.string().max(500).default(''),
  style: zStyle,
  humorLevel: z.number().int().min(0).max(4),
  flirtingLevel: z.number().int().min(0).max(4),
  formality: z.number().int().min(0).max(3),
  messageLength: z.enum(['short', 'medium', 'long']),
  useEmojis: z.boolean(),
  topicsToAvoid: zTagList(),
  boundaries: z.string().max(1000).default(''),
  grammaticalGender: z.enum(['masculine', 'feminine', 'neutral', 'unspecified']).default('unspecified'),
});

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, Body);
  const data = { ...b, aboutMe: encrypt(b.aboutMe), boundaries: encrypt(b.boundaries) };
  await db.personalityProfile.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  return json({ ok: true });
});
