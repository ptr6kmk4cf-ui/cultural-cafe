import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { zTagList } from '@/lib/validation';

const Body = z
  .object({
    ageMin: z.number().int().min(18).max(99),
    ageMax: z.number().int().min(18).max(99),
    location: z.string().max(120).default(''),
    maxDistanceKm: z.number().int().min(0).max(20000),
    relationshipGoals: zTagList(10),
    interests: zTagList(),
    lifestyle: zTagList(),
    physicalPreferences: z.string().max(300).default(''),
    dealbreakers: zTagList(),
    analyzePhotos: z.boolean(),
  })
  .refine((v) => v.ageMin <= v.ageMax, { message: 'Minimum age must be ≤ maximum age', path: ['ageMin'] });

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const data = await parseBody(req, Body);
  await db.matchPreferences.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  return json({ ok: true });
});
