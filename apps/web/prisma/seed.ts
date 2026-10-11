// Seeds a ready-to-use local demo account (and optionally an admin) for development.
//   npm run db:seed
// Credentials come from env (SEED_DEMO_PASSWORD / SEED_ADMIN_PASSWORD); if unset, a
// random password is generated and printed once. Refuses to run in production.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/lib/crypto';

const db = new PrismaClient();

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo accounts in production.');
  process.exit(1);
}

async function upsertUser(
  email: string,
  name: string,
  password: string,
  role: 'USER' | 'ADMIN',
  extra?: {
    language?: string;
    languages?: string[];
    city?: string;
    country?: string;
    bio?: string;
    interests?: string[];
    world?: boolean;
  },
) {
  const passwordHash = await bcrypt.hash(password, 12);
  const lang = extra?.language ?? 'en';
  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash, role },
    create: {
      email,
      name,
      passwordHash,
      role,
      birthDate: new Date('1992-06-15T00:00:00Z'),
      adultConfirmed: true,
      termsAcceptedAt: new Date(),
      language: { create: { myLanguage: lang, defaultReplyLanguage: lang, defaultMode: 'AUTO', preferredLanguages: extra?.languages ?? [lang, 'en'] } },
      autopilot: { create: {} },
      personality: {
        create: {
          displayName: name,
          aboutMe: encrypt(extra?.bio ?? 'Software engineer living in Paris. Climbs at Fontainebleau most weekends, cooks a mean shakshuka, hiked the Rota Vicentina in Portugal last summer.'),
          interests: extra?.interests ?? ['climbing', 'hiking', 'cooking', 'travel', 'literature'],
          intentions: extra?.world ? 'meet people from other cultures' : 'long-term relationship',
          personality: 'curious, warm, a bit nerdy',
          style: 'natural',
        },
      },
      preferences: {
        create: {
          ageMin: 25,
          ageMax: 38,
          location: extra?.city ?? 'Paris',
          maxDistanceKm: 100,
          relationshipGoals: extra?.world ? [] : ['long-term relationship'],
          interests: extra?.interests ?? ['climbing', 'hiking', 'travel', 'cooking'],
          lifestyle: ['non-smoker'],
          dealbreakers: ['smoker'],
        },
      },
      worldProfile: {
        create: {
          optedIn: extra?.world ?? false,
          city: extra?.city ?? (extra?.world ? '' : 'Paris'),
          country: extra?.country ?? (extra?.world ? '' : 'France'),
          bio: extra?.bio ? encrypt(extra.bio) : '',
          available: extra?.world ?? false,
          lastSeenAt: new Date(),
          queuedAt: extra?.world ? new Date() : null,
        },
      },
    },
  });
  if (extra) {
    await db.languageSettings.upsert({
      where: { userId: user.id },
      update: { myLanguage: lang, defaultReplyLanguage: lang, preferredLanguages: extra.languages ?? [lang, 'en'] },
      create: { userId: user.id, myLanguage: lang, defaultReplyLanguage: lang, preferredLanguages: extra.languages ?? [lang, 'en'] },
    });
    await db.worldProfile.upsert({
      where: { userId: user.id },
      update: {
        optedIn: extra.world ?? false,
        city: extra.city ?? '',
        country: extra.country ?? '',
        bio: extra.bio ? encrypt(extra.bio) : '',
        available: extra.world ?? false,
        lastSeenAt: new Date(),
        queuedAt: extra.world ? new Date() : null,
      },
      create: {
        userId: user.id,
        optedIn: extra.world ?? false,
        city: extra.city ?? '',
        country: extra.country ?? '',
        bio: extra.bio ? encrypt(extra.bio) : '',
        available: extra.world ?? false,
        lastSeenAt: new Date(),
        queuedAt: extra.world ? new Date() : null,
      },
    });
  }
  return user;
}

const generated: string[] = [];
const pw = (envName: string) => {
  const v = process.env[envName];
  if (v && v.length >= 10) return v;
  const p = randomBytes(12).toString('base64url');
  generated.push(`${envName}=${p}`);
  return p;
};

async function main() {
  const demoEmail = process.env.SEED_DEMO_EMAIL || 'demo@conversa.local';
  await upsertUser(demoEmail, 'Demo', pw('SEED_DEMO_PASSWORD'), 'USER', {
    language: 'en',
    languages: ['en', 'fr', 'es'],
    city: 'Paris',
    country: 'France',
    bio: 'I climb at Fontainebleau and cook a mean shakshuka. Happy to swap an hour of my evening for yours.',
    world: true,
  });
  console.log(`✓ demo user: ${demoEmail}`);

  const worldPw = process.env.SEED_WORLD_PASSWORD || process.env.SEED_DEMO_PASSWORD || pw('SEED_WORLD_PASSWORD');
  const travelers = [
    { email: 'noor@conversa.local', name: 'Noor', language: 'ar', languages: ['ar', 'en'], city: 'Cairo', country: 'Egypt', interests: ['poetry', 'nile walks', 'photography'], bio: 'I walk along the Nile after work and collect first lines of songs.' },
    { email: 'yuki@conversa.local', name: 'Yuki', language: 'ja', languages: ['ja', 'en'], city: 'Tokyo', country: 'Japan', interests: ['jazz kissaten', 'cycling', 'ceramics'], bio: 'Night-shift nurse. I know the best late ramen streets in Koenji.' },
    { email: 'piotr@conversa.local', name: 'Piotr', language: 'pl', languages: ['pl', 'en'], city: 'Kraków', country: 'Poland', interests: ['mountains', 'bread', 'chess'], bio: 'I bake on Sundays and disappear into the Tatras when I can.' },
    { email: 'amara@conversa.local', name: 'Amara', language: 'sw', languages: ['sw', 'en'], city: 'Nairobi', country: 'Kenya', interests: ['running', 'radio', 'markets'], bio: 'I run at dawn and hunt spices in Toi Market on Saturdays.' },
    { email: 'lucia@conversa.local', name: 'Lucía', language: 'es', languages: ['es', 'en'], city: 'Mexico City', country: 'Mexico', interests: ['murales', 'comida callejera', 'cine'], bio: 'Architect. I will talk for an hour about tacos al pastor and brutalist buildings.' },
  ];
  for (const t of travelers) {
    await upsertUser(t.email, t.name, worldPw, 'USER', { ...t, world: true });
    console.log(`✓ world traveler: ${t.email} (${t.city})`);
  }

  if (process.env.ADMIN_EMAIL) {
    await upsertUser(process.env.ADMIN_EMAIL.toLowerCase(), 'Admin', pw('SEED_ADMIN_PASSWORD'), 'ADMIN');
    console.log(`✓ admin user: ${process.env.ADMIN_EMAIL}`);
  }

  if (generated.length) {
    console.log('\nGenerated passwords (shown once — add to .env to keep them stable):');
    for (const g of generated) console.log(`  ${g}`);
  }
}

main().finally(() => db.$disconnect());
