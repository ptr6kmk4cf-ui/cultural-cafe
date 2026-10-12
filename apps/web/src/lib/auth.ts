import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { SessionKind, User } from '@prisma/client';
import { db } from './db';
import { randomToken, sha256 } from './crypto';
import { discardFinishedWork } from './finished-work';
import { HttpError } from './http';

export const SESSION_COOKIE = 'conversa_session';
const WEB_SESSION_DAYS = 14;
const EXTENSION_SESSION_DAYS = 90;

export type AuthUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'plan'>;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string, kind: SessionKind = 'WEB', label?: string) {
  const token = randomToken();
  const days = kind === 'WEB' ? WEB_SESSION_DAYS : EXTENSION_SESSION_DAYS;
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: {
      userId,
      kind,
      label,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + days * 86400_000),
    },
  });
  return { token, maxAge: days * 86400 };
}

export async function setSessionCookie(token: string, maxAge: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

async function userFromToken(token: string): Promise<AuthUser | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, plan: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return session.user;
}

export const PRODUCTION_ORIGIN = 'https://culturalcafe.online';

function appOrigin() {
  return new URL(process.env.APP_URL || (process.env.NODE_ENV === 'production' ? PRODUCTION_ORIGIN : 'http://localhost:3000')).origin;
}

function refererOrigin(referer: string | null) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function allowedOrigins() {
  const origin = appOrigin();
  const allowed = new Set([origin]);
  try {
    const u = new URL(origin);
    if (u.hostname.startsWith('www.')) allowed.add(`${u.protocol}//${u.hostname.slice(4)}`);
    else if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') allowed.add(`${u.protocol}//www.${u.hostname}`);
  } catch {
    /* ignore */
  }
  return allowed;
}

/**
 * Resolves the caller for an API route.
 * - Extension: `Authorization: Bearer <token>` (token issued via /extension/connect).
 * - Web: httpOnly session cookie, with an Origin check on state-changing requests (CSRF).
 */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const user = await userFromToken(header.slice(7).trim());
    if (!user) throw new HttpError(401, 'Invalid or expired token', 'unauthenticated');
    return user;
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new HttpError(401, 'Not signed in', 'unauthenticated');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin') || refererOrigin(req.headers.get('referer'));
    if (!origin || !allowedOrigins().has(origin)) throw new HttpError(403, 'Cross-origin request blocked', 'csrf');
  }
  const user = await userFromToken(token);
  if (!user) throw new HttpError(401, 'Session expired', 'unauthenticated');
  await discardFinishedWork().catch(() => {});
  return user;
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Admins only', 'forbidden');
  return user;
}

/** For server components / layouts. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return token ? userFromToken(token) : null;
}

export async function destroySessionByToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function ageFromBirthDate(birth: Date, now = new Date()) {
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
