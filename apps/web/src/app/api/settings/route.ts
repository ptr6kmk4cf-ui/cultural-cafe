import { requireUser } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const [personality, language, preferences] = await Promise.all([
    db.personalityProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, displayName: user.name } }),
    db.languageSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } }),
    db.matchPreferences.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } }),
  ]);
  return json({
    personality: { ...personality, aboutMe: decrypt(personality.aboutMe), boundaries: decrypt(personality.boundaries) },
    language,
    preferences,
  });
});
