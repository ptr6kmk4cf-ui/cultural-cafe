import { z } from 'zod';
import { db } from '@/lib/db';
import { ageFromBirthDate, createSession, hashPassword, setSessionCookie } from '@/lib/auth';
import { parseIsoBirthDate } from '@/lib/birth-date';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { isLooseCafeEmail } from '@/lib/services/cafe-guests';
import { claimFriendInvite, newInviteCode, normalizeInviteCode } from '@/lib/services/world';

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  name: z.string().trim().min(1).max(60),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmAdult: z.literal(true, { errorMap: () => ({ message: 'You must confirm you are 18 or older' }) }),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms and privacy policy' }) }),
  inviteCode: z.string().trim().min(4).max(16).optional(),
});

export const POST = route(async (req) => {
  await rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);
  const body = await parseBody(req, Body);
  if (!parseIsoBirthDate(body.birthDate)) {
    throw new HttpError(400, 'That date is not a real day. Check the day, month, and year.', 'birth_invalid');
  }
  const birth = new Date(`${body.birthDate}T00:00:00Z`);
  if (ageFromBirthDate(birth) < 18) {
    throw new HttpError(403, 'Cultural Café is only available to adults aged 18 or older.', 'underage');
  }
  if (isLooseCafeEmail(body.email)) {
    throw new HttpError(400, 'Use your own email address.', 'loose_email');
  }
  if (await db.user.findUnique({ where: { email: body.email } })) {
    throw new HttpError(409, 'An account with this email already exists.', 'email_taken');
  }
  const isAdmin = !!process.env.ADMIN_EMAIL && body.email === process.env.ADMIN_EMAIL.toLowerCase();
  const user = await db.user.create({
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      name: body.name,
      birthDate: birth,
      adultConfirmed: true,
      termsAcceptedAt: new Date(),
      role: isAdmin ? 'ADMIN' : 'USER',
      personality: { create: { displayName: body.name } },
      language: { create: {} },
      preferences: { create: {} },
      autopilot: { create: {} },
      worldProfile: { create: { inviteCode: newInviteCode() } },
    },
  });
  const inviteCode = body.inviteCode ? normalizeInviteCode(body.inviteCode) : null;
  if (inviteCode) {
    try {
      await claimFriendInvite(user.id, inviteCode);
    } catch {
      /* Invalid or blocked invite; the account is still created. */
    }
  }
  const { token, maxAge } = await createSession(user.id, 'WEB');
  await setSessionCookie(token, maxAge);
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.name } }, 201);
});
