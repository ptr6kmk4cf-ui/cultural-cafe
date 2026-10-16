import { randomBytes } from 'node:crypto';
import type { WorldConversation, WorldInvite, WorldProfile } from '@prisma/client';
import { languageName } from '@conversa/shared';
import { assignTablePrompt, tablePromptFor } from '@/lib/services/cafe-topics';
import type { AuthUser } from '../auth';
import { PRODUCTION_ORIGIN, ageFromBirthDate } from '../auth';
import { decrypt } from '../crypto';
import { db } from '../db';
import { discardFinishedWork, dropFinishedInvite } from '../finished-work';
import { HttpError, notFound } from '../http';
import { PLAN_LIMITS, assertWorldQuota } from '../plans';
import { outgoingLanguages } from '../ai/lang';
import { translateText } from '../ai/tasks';
import { detectSensitiveRequest } from '../ai/safety';
import { parseSignalBody, signalPhase } from '../world-signal';
import { isLooseCafeEmail, looseCafeUserFilter, warmCafeGuests } from './cafe-guests';

export const WORLD_SESSION_MS = 60 * 60_000;
export const WORLD_INVITE_MS = 10 * 60_000;
export const WORLD_FRIEND_INVITE_MS = 24 * 60 * 60_000;
export const WORLD_QUEUE_FRESH_MS = 90_000;
export const WORLD_ONLINE_MS = 45_000;
export const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const INVITE_CODE_SET = new Set(INVITE_CODE_ALPHABET);
const EXPIRE_EVERY_MS = 10_000;
const PRESENCE_TOUCH_MS = 20_000;
let lastExpireAt = 0;

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'Traveler';
}

export function newInviteCode() {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  return [...bytes].map((b) => INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length]).join('');
}

export function isInviteCode(value: string) {
  return value.length === INVITE_CODE_LENGTH && [...value].every((ch) => INVITE_CODE_SET.has(ch));
}

export function normalizeInviteCode(value: string) {
  const code = value.trim().toLowerCase();
  return isInviteCode(code) ? code : null;
}

export function friendJoinPath(code: string) {
  return `/join/${code}`;
}

export function friendJoinUrl(code: string) {
  const origin = new URL(process.env.APP_URL || (process.env.NODE_ENV === 'production' ? PRODUCTION_ORIGIN : 'http://localhost:3000')).origin;
  return `${origin}${friendJoinPath(code)}`;
}

export function friendInviteMessage(url: string) {
  return `Take a table with me in Cultural Café. You write in your own language: ${url}`;
}

async function assignInviteCode(userId: string) {
  for (let i = 0; i < 8; i++) {
    try {
      return await db.worldProfile.update({ where: { userId }, data: { inviteCode: newInviteCode() } });
    } catch {
      /* unique collision on inviteCode */
    }
  }
  const again = await db.worldProfile.findUnique({ where: { userId } });
  if (again?.inviteCode) return again;
  throw new HttpError(500, 'Could not create an invite link.');
}

export async function getOrCreateProfile(userId: string) {
  const existing = await db.worldProfile.findUnique({ where: { userId } });
  if (existing?.inviteCode) return existing;
  if (existing) return assignInviteCode(userId);
  for (let i = 0; i < 8; i++) {
    try {
      return await db.worldProfile.create({ data: { userId, inviteCode: newInviteCode() } });
    } catch {
      /* unique collision, or the row appeared */
    }
  }
  const raced = await db.worldProfile.findUnique({ where: { userId } });
  if (raced?.inviteCode) return raced;
  if (raced) return assignInviteCode(userId);
  throw new HttpError(500, 'Could not create a café card.');
}

export async function touchPresence(userId: string, available?: boolean) {
  const data: { lastSeenAt: Date; available?: boolean; queuedAt?: Date | null; inviteCode?: string } = { lastSeenAt: new Date() };
  if (available === false) {
    data.available = false;
    data.queuedAt = null;
  } else if (available === true) {
    data.available = true;
  }
  try {
    return await db.worldProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, inviteCode: newInviteCode(), ...data },
    });
  } catch {
    return db.worldProfile.update({ where: { userId }, data });
  }
}

export async function touchPresenceIfStale(profile: WorldProfile) {
  if (Date.now() - profile.lastSeenAt.getTime() < PRESENCE_TOUCH_MS) return profile;
  return db.worldProfile.update({ where: { userId: profile.userId }, data: { lastSeenAt: new Date() } });
}

export async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await db.worldBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return ids;
}

/** People this account has already sat with. They stay out of a new café session. */
export async function metPartnerIds(userId: string) {
  const rows = await db.worldConversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  const ids = new Set<string>();
  for (const row of rows) ids.add(row.userAId === userId ? row.userBId : row.userAId);
  return ids;
}

export async function isBlocked(a: string, b: string) {
  return !!(await db.worldBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  }));
}

async function wipeHourRecords(ids: string[]) {
  if (!ids.length) return;
  await Promise.all([
    db.worldMessage.deleteMany({ where: { conversationId: { in: ids } } }),
    db.worldSignal.deleteMany({ where: { conversationId: { in: ids } } }),
    db.worldPeerLink.deleteMany({ where: { conversationId: { in: ids } } }),
    db.worldBoard.deleteMany({ where: { conversationId: { in: ids } } }),
  ]);
}

/** Lines, connection setup, and the invite belong to the table. They go when the table is finished. */
async function discardTableWork(ids: string[]) {
  if (!ids.length) return;
  await wipeHourRecords(ids);
  await db.worldInvite.deleteMany({ where: { conversationId: { in: ids } } });
  for (const id of ids) forgetSignalMemory(id);
}

export async function expireStale(force = false) {
  const t = Date.now();
  if (!force && t - lastExpireAt < EXPIRE_EVERY_MS) return;
  lastExpireAt = t;
  const now = new Date(t);
  const due = await db.worldConversation.findMany({
    where: { status: 'ACTIVE', endsAt: { lt: now } },
    select: { id: true },
  });
  if (due.length) {
    const ids = due.map((c) => c.id);
    await db.worldConversation.updateMany({ where: { id: { in: ids } }, data: { status: 'ENDED', endedAt: now } });
    await discardTableWork(ids);
  }
  await discardFinishedWork(force);
  await db.worldProfile.updateMany({
    where: { available: true, lastSeenAt: { lt: new Date(t - WORLD_QUEUE_FRESH_MS) } },
    data: { available: false, queuedAt: null },
  });
  await ejectUserContent();
}

const LINK_STALE_MS = 90_000;

/** Café lines are not kept. Connection setup for ended hours, and for people who left, is removed too. */
async function ejectUserContent() {
  const iceCutoff = new Date(Date.now() - 90_000);
  const signalWhere = {
    OR: [{ conversation: { status: { not: 'ACTIVE' as const } } }, { type: 'ice', createdAt: { lt: iceCutoff } }],
  };
  const [message, signal, link] = await Promise.all([
    db.worldMessage.findFirst({ select: { id: true } }),
    db.worldSignal.findFirst({ where: signalWhere, select: { id: true } }),
    db.worldPeerLink.findFirst({ where: { conversation: { status: { not: 'ACTIVE' } } }, select: { userId: true } }),
  ]);
  await Promise.all([
    message ? db.worldMessage.deleteMany({}) : Promise.resolve(),
    signal ? db.worldSignal.deleteMany({ where: signalWhere }) : Promise.resolve(),
    link ? db.worldPeerLink.deleteMany({ where: { conversation: { status: { not: 'ACTIVE' } } } }) : Promise.resolve(),
  ]);
  await ejectQuietLinks();
}

function forgetSignalMemory(conversationId: string, userId?: string) {
  if (!userId) signalSweepAt.delete(conversationId);
  for (const key of signalPartCache.keys()) {
    if (userId ? key === `${userId}:${conversationId}` : key.endsWith(`:${conversationId}`)) signalPartCache.delete(key);
  }
}

async function dropLinkData(conversationId: string, userId: string) {
  await Promise.all([
    db.worldSignal.deleteMany({ where: { conversationId, fromId: userId } }),
    db.worldPeerLink.deleteMany({ where: { conversationId, userId } }),
  ]);
  forgetSignalMemory(conversationId, userId);
  const left = await db.worldPeerLink.count({ where: { conversationId } });
  if (!left) {
    await db.worldSignal.deleteMany({ where: { conversationId } });
    forgetSignalMemory(conversationId);
  }
}

/** Someone closed the hour. Their connection setup is removed immediately. */
export async function releaseCafeLink(userId: string, conversationId: string) {
  await requireParticipant(userId, conversationId);
  await dropLinkData(conversationId, userId);
}

/** The café page is still open. Refreshes presence without keeping chat text. */
export async function touchCafeLink(userId: string, conversationId: string, phase: string) {
  const c = await requireParticipant(userId, conversationId);
  if (c.status !== 'ACTIVE' || c.endsAt < new Date()) {
    await dropLinkData(conversationId, userId);
    throw new HttpError(409, 'This table has closed.', 'ended');
  }
  const safe = phase === 'open' || phase === 'restarting' ? phase : 'connecting';
  await db.worldPeerLink.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, phase: safe },
    update: { phase: safe },
  });
}

async function ejectQuietLinks() {
  const cutoff = new Date(Date.now() - LINK_STALE_MS);
  const stale = await db.worldPeerLink.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { conversationId: true, userId: true },
  });
  if (!stale.length) return;
  await db.worldSignal.deleteMany({
    where: { OR: stale.map((s) => ({ conversationId: s.conversationId, fromId: s.userId })) },
  });
  await db.worldPeerLink.deleteMany({
    where: { OR: stale.map((s) => ({ conversationId: s.conversationId, userId: s.userId })) },
  });
  const ids = [...new Set(stale.map((s) => s.conversationId))];
  const still = await db.worldPeerLink.findMany({
    where: { conversationId: { in: ids } },
    select: { conversationId: true },
  });
  const live = new Set(still.map((s) => s.conversationId));
  const empty = ids.filter((id) => !live.has(id));
  if (empty.length) {
    await db.worldSignal.deleteMany({ where: { conversationId: { in: empty } } });
    for (const id of empty) forgetSignalMemory(id);
  }
  for (const row of stale) forgetSignalMemory(row.conversationId, row.userId);
}

function linkPerson(
  user: { id: string; name: string; email: string; synthetic?: boolean; worldProfile: { city: string; country: string } | null },
  link: { phase: string; updatedAt: Date } | undefined,
) {
  return {
    id: user.id,
    name: firstName(user.name),
    email: user.email,
    guest: !!user.synthetic,
    city: user.worldProfile?.city ?? '',
    country: user.worldProfile?.country ?? '',
    phase: link?.phase ?? 'away',
    seenAt: link?.updatedAt.toISOString() ?? null,
  };
}

/** Active café hours and who still has a live link. No chat text and no connection payloads. */
export async function listLiveLinks() {
  await ejectQuietLinks();
  const rows = await db.worldConversation.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: {
      links: true,
      userA: { select: { id: true, name: true, email: true, synthetic: true, worldProfile: { select: { city: true, country: true } } } },
      userB: { select: { id: true, name: true, email: true, synthetic: true, worldProfile: { select: { city: true, country: true } } } },
      _count: { select: { signals: true, messages: true } },
    },
  });
  return rows.map((c) => {
    const linkA = c.links.find((l) => l.userId === c.userAId);
    const linkB = c.links.find((l) => l.userId === c.userBId);
    return {
      id: c.id,
      startedAt: c.startedAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      remainingMs: Math.max(0, c.endsAt.getTime() - Date.now()),
      signals: c._count.signals,
      messages: c._count.messages,
      personA: linkPerson(c.userA, linkA),
      personB: linkPerson(c.userB, linkB),
    };
  });
}

export async function adminEndConversation(conversationId: string) {
  const c = await db.worldConversation.findUnique({ where: { id: conversationId } });
  if (!c) throw notFound();
  if (c.status === 'ACTIVE') {
    await db.worldConversation.update({ where: { id: c.id }, data: { status: 'ENDED', endedAt: new Date() } });
  }
  await discardTableWork([c.id]);
}

export async function adminClearConnection(conversationId: string) {
  const c = await db.worldConversation.findUnique({ where: { id: conversationId } });
  if (!c) throw notFound();
  await discardTableWork([c.id]);
}

export async function activeConversation(userId: string) {
  return db.worldConversation.findFirst({
    where: { status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }] },
  });
}

export async function pendingInvites(userId: string) {
  return db.worldInvite.findMany({
    where: { status: 'PENDING', OR: [{ fromId: userId }, { toId: userId }] },
    orderBy: { createdAt: 'desc' },
  });
}

export async function requireParticipant(userId: string, conversationId: string) {
  const c = await db.worldConversation.findUnique({ where: { id: conversationId } });
  if (!c || (c.userAId !== userId && c.userBId !== userId)) throw notFound();
  return c;
}

export async function peerId(c: WorldConversation, me: string) {
  return c.userAId === me ? c.userBId : c.userAId;
}

function cardFromUser(
  u: {
    id: string;
    name: string;
    birthDate: Date;
    synthetic?: boolean;
    personality: { displayName: string | null; interests: string[] } | null;
    language: { myLanguage: string; preferredLanguages: string[] } | null;
    worldProfile: { city: string; country: string; gender: string; bio: string; portraitPhotoId: string | null; lastSeenAt: Date; available: boolean } | null;
  },
) {
  const online = u.worldProfile ? Date.now() - u.worldProfile.lastSeenAt.getTime() < WORLD_ONLINE_MS : false;
  return {
    id: u.id,
    name: (u.personality?.displayName || u.name).trim() || 'Traveler',
    age: ageFromBirthDate(u.birthDate),
    city: u.worldProfile?.city ?? '',
    country: u.worldProfile?.country ?? '',
    gender: cafeGender(u.worldProfile?.gender),
    bio: u.worldProfile ? decrypt(u.worldProfile.bio) : '',
    language: u.language?.myLanguage ?? 'en',
    languageLabel: languageName(u.language?.myLanguage ?? 'en'),
    languages: u.language?.preferredLanguages ?? [u.language?.myLanguage ?? 'en'],
    interests: u.personality?.interests ?? [],
    portraitUrl: u.worldProfile?.portraitPhotoId ? `/api/world/people/${u.id}/portrait` : null,
    online,
    available: !!(u.worldProfile?.available && online),
    guest: !!u.synthetic,
  };
}

const CARD_INCLUDE = {
  personality: { select: { displayName: true, interests: true } },
  language: { select: { myLanguage: true, preferredLanguages: true } },
  worldProfile: { select: { city: true, country: true, gender: true, bio: true, portraitPhotoId: true, lastSeenAt: true, available: true, optedIn: true } },
} as const;

async function loadUserCard(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, birthDate: true, synthetic: true, ...CARD_INCLUDE },
  });
}

export async function publicCard(userId: string, viewerId?: string) {
  const u = await loadUserCard(userId);
  if (!u?.worldProfile?.optedIn) return null;
  if (viewerId && (await isBlocked(userId, viewerId))) return null;
  return cardFromUser(u);
}

/** First name and city for a café hour, even if they later left the Café. */
export async function cafePeerCard(userId: string, viewerId?: string) {
  const u = await loadUserCard(userId);
  if (!u) return null;
  if (viewerId && (await isBlocked(userId, viewerId))) return null;
  return cardFromUser(u);
}

export async function cafeDisplayName(userId: string, accountName: string) {
  const personality = await db.personalityProfile.findUnique({ where: { userId }, select: { displayName: true } });
  return (personality?.displayName || accountName).trim() || accountName.trim();
}

export function cafeGender(value: string | null | undefined): '' | 'man' | 'woman' {
  return value === 'man' || value === 'woman' ? value : '';
}

export function serializeProfile(p: WorldProfile, name = '') {
  return {
    optedIn: p.optedIn,
    available: p.available,
    name,
    city: p.city,
    country: p.country,
    gender: cafeGender(p.gender),
    bio: decrypt(p.bio),
    portraitPhotoId: p.portraitPhotoId,
    inviteCode: p.inviteCode,
    lastSeenAt: p.lastSeenAt,
  };
}

export async function lookupFriendInvite(code: string) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  const profile = await db.worldProfile.findUnique({
    where: { inviteCode: normalized },
    include: { user: { select: { synthetic: true, name: true, personality: { select: { displayName: true } } } } },
  });
  if (!profile || profile.user.synthetic) return null;
  return {
    code: normalized,
    userId: profile.userId,
    name: (profile.user.personality?.displayName || profile.user.name).trim() || 'Traveler',
    city: profile.city,
    country: profile.country,
    inCafe: profile.optedIn,
  };
}

export async function claimFriendInvite(userId: string, code: string) {
  const host = await lookupFriendInvite(code);
  if (!host) throw notFound();
  if (host.userId === userId) return getOrCreateProfile(userId);
  if (await isBlocked(userId, host.userId)) throw new HttpError(403, 'You cannot contact this person.', 'blocked');
  const mine = await getOrCreateProfile(userId);
  if (mine.invitedByUserId && mine.invitedByUserId !== host.userId) return mine;
  const updated = mine.invitedByUserId === host.userId
    ? mine
    : await db.worldProfile.update({ where: { userId }, data: { invitedByUserId: host.userId } });
  await tryOfferFriendHours(userId, { includeInvitees: true });
  return updated;
}

async function offerFriendHourFor(inviteeId: string) {
  const invitee = await db.worldProfile.findUnique({
    where: { userId: inviteeId },
    select: { optedIn: true, invitedByUserId: true },
  });
  const hostId = invitee?.invitedByUserId;
  if (!invitee?.optedIn || !hostId) return;
  const [host, blocked, busy, prior] = await Promise.all([
    db.worldProfile.findUnique({ where: { userId: hostId }, select: { optedIn: true } }),
    isBlocked(inviteeId, hostId),
    db.worldConversation.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: { in: [inviteeId, hostId] } }, { userBId: { in: [inviteeId, hostId] } }],
      },
      select: { id: true },
    }),
    db.worldInvite.findFirst({
      where: {
        OR: [
          { fromId: inviteeId, toId: hostId },
          { fromId: hostId, toId: inviteeId },
        ],
        status: { in: ['PENDING', 'DECLINED', 'ACCEPTED'] },
      },
      select: { status: true },
    }),
  ]);
  if (!host?.optedIn || blocked || busy || prior) return;
  const hostUser = await db.user.findUnique({ where: { id: hostId }, select: { plan: true } });
  try {
    if (hostUser) await assertWorldQuota(hostId, hostUser.plan);
  } catch {
    return;
  }
  try {
    await db.worldInvite.create({
      data: {
        kind: 'FRIEND',
        fromId: hostId,
        toId: inviteeId,
        acceptedByFrom: true,
        expiresAt: new Date(Date.now() + WORLD_FRIEND_INVITE_MS),
      },
    });
  } catch {
    /* concurrent poll already created it */
  }
}

export async function tryOfferFriendHours(userId: string, opts: { includeInvitees?: boolean } = {}) {
  const me = await db.worldProfile.findUnique({
    where: { userId },
    select: { invitedByUserId: true },
  });
  if (!me) return;
  const ids: string[] = [];
  if (me.invitedByUserId) ids.push(userId);
  if (opts.includeInvitees) {
    const invitees = await db.worldProfile.findMany({
      where: { invitedByUserId: userId, optedIn: true },
      select: { userId: true },
      take: 20,
    });
    for (const p of invitees) ids.push(p.userId);
  }
  for (const id of ids) await offerFriendHourFor(id);
}

export async function serializeInvite(inv: WorldInvite, me: string) {
  const otherId = inv.fromId === me ? inv.toId : inv.fromId;
  return {
    id: inv.id,
    kind: inv.kind,
    status: inv.status,
    incoming: inv.toId === me,
    iAccepted: inv.fromId === me ? inv.acceptedByFrom : inv.acceptedByTo,
    theyAccepted: inv.fromId === me ? inv.acceptedByTo : inv.acceptedByFrom,
    conversationId: inv.conversationId,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    peer: await cafePeerCard(otherId, me),
  };
}

export function worldIceServers() {
  const servers: { urls: string; username?: string; credential?: string }[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  const url = process.env.WORLD_TURN_URL?.trim();
  const username = process.env.WORLD_TURN_USERNAME?.trim();
  const credential = process.env.WORLD_TURN_CREDENTIAL?.trim();
  if (url && username && credential) servers.push({ urls: url, username, credential });
  return { iceServers: servers, turnConfigured: !!(url && username && credential) };
}

async function conversationDto(c: WorldConversation, me: string, peer: ReturnType<typeof cardFromUser> | null) {
  return {
    id: c.id,
    status: c.status,
    startedAt: c.startedAt,
    endsAt: c.endsAt,
    endedAt: c.endedAt,
    remainingMs: c.status === 'ACTIVE' ? Math.max(0, c.endsAt.getTime() - Date.now()) : 0,
    offerer: c.userAId === me,
    transport: 'webrtc' as const,
    ice: worldIceServers(),
    prompt: await tablePromptFor(c),
    peer,
  };
}

export async function serializeConversation(c: WorldConversation, me: string) {
  return conversationDto(c, me, await cafePeerCard(await peerId(c, me), me));
}

export async function serializeConversations(rows: WorldConversation[], me: string) {
  if (!rows.length) return [];
  if (rows.length === 1) return [await serializeConversation(rows[0], me)];
  const banned = await blockedIds(me);
  const ids = [...new Set(rows.map((c) => (c.userAId === me ? c.userBId : c.userAId)))].filter((id) => !banned.has(id));
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, birthDate: true, synthetic: true, ...CARD_INCLUDE },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return Promise.all(rows.map((c) => {
    const other = c.userAId === me ? c.userBId : c.userAId;
    const u = banned.has(other) ? undefined : byId.get(other);
    return conversationDto(c, me, u ? cardFromUser(u) : null);
  }));
}

export async function joinQueue(user: AuthUser) {
  await Promise.all([expireStale(true), warmCafeGuests()]);
  const profile = await getOrCreateProfile(user.id);
  if (!profile.optedIn) throw new HttpError(400, 'Save your profile first. Then you can meet someone.', 'world_opt_in');
  if (!profile.city.trim()) throw new HttpError(400, 'Add your city on your profile before you meet someone.', 'world_city');
  const active = await activeConversation(user.id);
  if (active) return { state: 'chatting' as const, conversation: await serializeConversation(active, user.id) };
  const pending = await pendingInvites(user.id);
  if (pending.length) return { state: 'pending' as const, invites: await Promise.all(pending.map((i) => serializeInvite(i, user.id))) };

  await assertWorldQuota(user.id, user.plan);
  await touchPresence(user.id, true);
  await db.worldProfile.update({ where: { userId: user.id }, data: { queuedAt: new Date(), available: true, lastSeenAt: new Date() } });

  const banned = await blockedIds(user.id);
  const met = await metPartnerIds(user.id);
  const fresh = new Date(Date.now() - WORLD_QUEUE_FRESH_MS);
  const candidates = await db.worldProfile.findMany({
    where: {
      optedIn: true,
      available: true,
      queuedAt: { gte: fresh },
      userId: { not: user.id, notIn: [...banned, ...met] },
    },
    take: 20,
    include: { user: { select: { synthetic: true, email: true } } },
    orderBy: { queuedAt: 'asc' },
  });
  const busy = new Set<string>();
  if (candidates.length) {
    const open = await db.worldConversation.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: { in: candidates.map((c) => c.userId) } }, { userBId: { in: candidates.map((c) => c.userId) } }],
      },
      select: { userAId: true, userBId: true },
    });
    for (const o of open) {
      busy.add(o.userAId);
      busy.add(o.userBId);
    }
    const pendingThem = await db.worldInvite.findMany({
      where: {
        status: 'PENDING',
        OR: [{ fromId: { in: candidates.map((c) => c.userId) } }, { toId: { in: candidates.map((c) => c.userId) } }],
      },
    });
    for (const p of pendingThem) {
      busy.add(p.fromId);
      busy.add(p.toId);
    }
  }
  const free = candidates.filter((c) => !busy.has(c.userId) && !isLooseCafeEmail(c.user.email));
  const realPartner = free.find((c) => !c.user.synthetic);
  let partner = realPartner;
  if (!partner) {
    const otherReal = await db.user.count({
      where: {
        id: { not: user.id },
        synthetic: false,
        NOT: looseCafeUserFilter(),
        worldProfile: { is: { optedIn: true } },
      },
    });
    // A guest fills the queue only when nobody else has joined the café.
    if (otherReal === 0) partner = free.find((c) => c.user.synthetic);
  }
  if (!partner) return { state: 'queued' as const, invites: [] };

  if (partner.user.synthetic) {
    const invite = await db.worldInvite.create({
      data: {
        kind: 'RANDOM',
        fromId: user.id,
        toId: partner.userId,
        acceptedByFrom: true,
        acceptedByTo: true,
        expiresAt: new Date(Date.now() + WORLD_INVITE_MS),
      },
    });
    try {
      const opened = await openAcceptedHour(invite, user);
      return { state: 'chatting' as const, conversation: opened.conversation, invites: [] as Awaited<ReturnType<typeof serializeInvite>>[] };
    } catch (err) {
      await dropFinishedInvite(invite.id);
      throw err;
    }
  }

  const invite = await db.worldInvite.create({
    data: {
      kind: 'RANDOM',
      fromId: partner.userId,
      toId: user.id,
      acceptedByFrom: false,
      expiresAt: new Date(Date.now() + WORLD_INVITE_MS),
    },
  });
  await db.worldProfile.updateMany({
    where: { userId: { in: [user.id, partner.userId] } },
    data: { queuedAt: null },
  });
  return { state: 'pending' as const, invites: [await serializeInvite(invite, user.id)] };
}

export async function leaveQueue(userId: string) {
  await db.worldProfile.updateMany({ where: { userId }, data: { available: false, queuedAt: null, lastSeenAt: new Date() } });
  await db.worldInvite.deleteMany({
    where: { kind: 'RANDOM', status: 'PENDING', OR: [{ fromId: userId }, { toId: userId }] },
  });
}

export async function inviteFromBrowse(user: AuthUser, toId: string) {
  await expireStale(true);
  if (toId === user.id) throw new HttpError(400, 'You cannot invite yourself.');
  const theirs = await db.worldProfile.findUnique({ where: { userId: toId } });
  if (!theirs?.optedIn) throw notFound();
  if (await isBlocked(user.id, toId)) throw new HttpError(403, 'You cannot contact this person.', 'blocked');
  const target = await db.user.findUnique({ where: { id: toId }, select: { synthetic: true } });
  const guestSeat = !!target?.synthetic;
  if (!guestSeat && (await metPartnerIds(user.id)).has(toId)) {
    throw new HttpError(409, 'You already sat with this person. They are listed in Past contacts.', 'already_met');
  }
  const active = await activeConversation(user.id);
  if (active && (active.userAId === toId || active.userBId === toId)) {
    return { invite: null, conversation: await serializeConversation(active, user.id) };
  }
  if (active) {
    try {
      await endConversation(user.id, active.id);
    } catch (err) {
      if (await activeConversation(user.id)) throw err;
    }
  }
  if (!guestSeat && (await activeConversation(toId))) throw new HttpError(409, 'They are already in a conversation.', 'they_busy');
  const existing = await db.worldInvite.findFirst({
    where: { status: 'PENDING', OR: [{ fromId: user.id, toId }, { fromId: toId, toId: user.id }] },
  });
  if (existing && !guestSeat) return { invite: await serializeInvite(existing, user.id), conversation: null };
  if (existing) await dropFinishedInvite(existing.id);
  await assertWorldQuota(user.id, user.plan);
  const invite = await db.worldInvite.create({
    data: {
      kind: 'BROWSE',
      fromId: user.id,
      toId,
      acceptedByFrom: true,
      acceptedByTo: !!target?.synthetic,
      expiresAt: new Date(Date.now() + WORLD_INVITE_MS),
    },
  });
  if (!target?.synthetic) return { invite: await serializeInvite(invite, user.id), conversation: null };
  try {
    const opened = await openAcceptedHour(invite, user);
    const fresh = await db.worldInvite.findUniqueOrThrow({ where: { id: invite.id } });
    return { invite: await serializeInvite(fresh, user.id), conversation: opened.conversation };
  } catch (err) {
    await dropFinishedInvite(invite.id);
    throw err;
  }
}

async function openAcceptedHour(inv: WorldInvite, user: AuthUser) {
  await assertWorldQuota(user.id, user.plan);
  const otherId = inv.fromId === user.id ? inv.toId : inv.fromId;
  const other = await db.user.findUnique({ where: { id: otherId }, select: { synthetic: true } });
  if (await activeConversation(user.id) || (!other?.synthetic && await activeConversation(otherId))) {
    throw new HttpError(409, 'One of you is already in a conversation.', 'busy');
  }
  const [a, b] = [inv.fromId, inv.toId].sort();
  const created = await db.worldConversation.create({
    data: { userAId: a, userBId: b, endsAt: new Date(Date.now() + WORLD_SESSION_MS) },
  });
  const conv = await assignTablePrompt(created.id);
  await db.worldInvite.update({
    where: { id: inv.id },
    data: { acceptedByFrom: true, acceptedByTo: true, status: 'ACCEPTED', conversationId: conv.id },
  });
  await db.worldProfile.updateMany({
    where: { userId: { in: [inv.fromId, inv.toId] } },
    data: { available: false, queuedAt: null },
  });
  return { status: 'ACCEPTED' as const, conversation: await serializeConversation(conv, user.id) };
}

export async function respondInvite(user: AuthUser, inviteId: string, accept: boolean) {
  await expireStale(true);
  const inv = await db.worldInvite.findUnique({ where: { id: inviteId } });
  if (!inv || (inv.fromId !== user.id && inv.toId !== user.id)) throw notFound();
  if (inv.status !== 'PENDING') throw new HttpError(409, 'This invitation is no longer pending.', 'stale');
  if (inv.expiresAt < new Date()) {
    await dropFinishedInvite(inv.id);
    throw new HttpError(410, 'This invitation expired.', 'expired');
  }
  if (!accept) {
    await dropFinishedInvite(inv.id);
    return { status: 'DECLINED' as const, conversation: null };
  }
  const iAmFrom = inv.fromId === user.id;
  const next = {
    acceptedByFrom: iAmFrom ? true : inv.acceptedByFrom,
    acceptedByTo: iAmFrom ? inv.acceptedByTo : true,
  };
  if (!next.acceptedByFrom || !next.acceptedByTo) {
    const updated = await db.worldInvite.update({ where: { id: inv.id }, data: next });
    return { status: 'PENDING' as const, conversation: null, invite: await serializeInvite(updated, user.id) };
  }
  return openAcceptedHour(inv, user);
}

/** Discards every stored table and invite with one person, including a table that is still open. */
export async function forgetPastContact(userId: string, peerId: string) {
  if (peerId === userId) throw new HttpError(400, 'You cannot remove yourself.');
  const peer = await db.user.findUnique({ where: { id: peerId }, select: { id: true } });
  if (!peer) throw notFound();
  const pair = {
    OR: [
      { userAId: userId, userBId: peerId },
      { userAId: peerId, userBId: userId },
    ],
  };
  const rows = await db.worldConversation.findMany({ where: pair, select: { id: true, status: true } });
  if (!rows.length) throw new HttpError(404, 'That person is not in your past contacts.', 'not_found');
  const now = new Date();
  const open = rows.filter((row) => row.status === 'ACTIVE').map((row) => row.id);
  if (open.length) {
    await db.worldConversation.updateMany({
      where: { id: { in: open } },
      data: { status: 'ENDED', endedAt: now, endedById: userId },
    });
  }
  const ids = rows.map((row) => row.id);
  await discardTableWork(ids);
  await db.worldInvite.deleteMany({
    where: { OR: [{ fromId: userId, toId: peerId }, { fromId: peerId, toId: userId }] },
  });
  await db.worldConversation.deleteMany({ where: { id: { in: ids } } });
  return { ok: true as const, removed: ids.length };
}

export async function endConversation(userId: string, conversationId: string) {
  const c = await requireParticipant(userId, conversationId);
  if (c.status !== 'ACTIVE') return c;
  const ended = await db.worldConversation.update({
    where: { id: c.id },
    data: { status: 'ENDED', endedAt: new Date(), endedById: userId },
  });
  await discardTableWork([c.id]);
  return ended;
}

/** Translate a line and hand it back. The words are not written to the database. */
export async function prepareWorldMessage(user: AuthUser, conversationId: string, text: string) {
  const c = await requireParticipant(user.id, conversationId);
  if (c.status !== 'ACTIVE' || c.endsAt < new Date()) {
    if (c.status === 'ACTIVE') {
      await db.worldConversation.update({ where: { id: c.id }, data: { status: 'ENDED', endedAt: new Date() } });
      await discardTableWork([c.id]);
    }
    throw new HttpError(409, 'This table has closed.', 'ended');
  }
  const other = await peerId(c, user.id);
  const [otherRow, myRow] = await Promise.all([
    db.languageSettings.findUnique({ where: { userId: other }, select: { myLanguage: true } }),
    db.languageSettings.findUnique({ where: { userId: user.id }, select: { myLanguage: true } }),
  ]);
  const otherLang = otherRow?.myLanguage ?? 'en';
  const myLang = myRow?.myLanguage ?? 'en';
  const { language, translateTo } = outgoingLanguages(text, myLang, otherLang);
  let translation: string | null = null;
  let translationLang: string | null = null;
  if (translateTo) {
    try {
      const t = await translateText(user, text, translateTo);
      translation = t.translation?.trim() || null;
      translationLang = translation ? translateTo : null;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      translation = null;
    }
    if (!translation) throw new HttpError(503, 'Could not translate that line. Tap Send again.', 'translate_failed');
  }
  return {
    id: randomBytes(12).toString('base64url'),
    text,
    language,
    translation,
    translationLang,
    flagged: detectSensitiveRequest(text),
    createdAt: new Date().toISOString(),
    mine: true,
  };
}

export async function listWorldMessages(userId: string, conversationId: string, opts: { known?: WorldConversation } = {}) {
  if (!opts.known) await requireParticipant(userId, conversationId);
  return [];
}

const SIGNAL_PART_TTL_MS = 10_000;
const SIGNAL_SWEEP_MS = 15_000;
const signalPartCache = new Map<string, { at: number; c: WorldConversation }>();
const signalSweepAt = new Map<string, number>();

function pruneSignalMemory() {
  const now = Date.now();
  for (const [key, value] of signalPartCache) {
    if (now - value.at > SIGNAL_PART_TTL_MS) signalPartCache.delete(key);
  }
  while (signalPartCache.size > 200) {
    const oldest = signalPartCache.keys().next().value;
    if (!oldest) break;
    signalPartCache.delete(oldest);
  }
  while (signalSweepAt.size > 200) {
    const oldest = signalSweepAt.keys().next().value;
    if (!oldest) break;
    signalSweepAt.delete(oldest);
  }
}

async function requireParticipantForSignal(userId: string, conversationId: string, fresh = false) {
  const key = `${userId}:${conversationId}`;
  const hit = signalPartCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < SIGNAL_PART_TTL_MS && hit.c.status === 'ACTIVE' && hit.c.endsAt > new Date()) return hit.c;
  const c = await requireParticipant(userId, conversationId);
  signalPartCache.set(key, { at: Date.now(), c });
  if (signalPartCache.size > 200 || signalSweepAt.size > 200) pruneSignalMemory();
  return c;
}

async function sweepSignals(conversationId: string, force = false) {
  const now = Date.now();
  const last = signalSweepAt.get(conversationId) ?? 0;
  if (!force && now - last < SIGNAL_SWEEP_MS) return;
  signalSweepAt.set(conversationId, now);
  await db.worldSignal.deleteMany({
    where: {
      conversationId,
      OR: [
        { type: 'ice', createdAt: { lt: new Date(now - 60_000) } },
        { type: 'restart', createdAt: { lt: new Date(now - 120_000) } },
      ],
    },
  });
  const count = await db.worldSignal.count({ where: { conversationId } });
  if (count <= 48) return;
  const [recent, latestOffer, latestAnswer] = await Promise.all([
    db.worldSignal.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true },
    }),
    db.worldSignal.findFirst({ where: { conversationId, type: 'offer' }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
    db.worldSignal.findFirst({ where: { conversationId, type: 'answer' }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
  ]);
  const keep = new Set(recent.map((row) => row.id));
  if (latestOffer) keep.add(latestOffer.id);
  if (latestAnswer) keep.add(latestAnswer.id);
  await db.worldSignal.deleteMany({ where: { conversationId, id: { notIn: [...keep] } } });
}

async function rememberPeerLink(conversationId: string, userId: string, attemptId: string, phase: string) {
  await db.worldPeerLink.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, attemptId, phase },
    update: { attemptId, phase },
  });
}

function mapSignal(s: { id: string; type: string; payload: string; createdAt: Date }) {
  return { id: s.id, type: s.type, payload: s.payload, createdAt: s.createdAt.toISOString() };
}

export async function postSignal(userId: string, conversationId: string, type: string, payload: string) {
  const c = await requireParticipantForSignal(userId, conversationId, true);
  if (c.status !== 'ACTIVE' || c.endsAt < new Date()) throw new HttpError(409, 'This table has closed.', 'ended');
  const attemptId = (parseSignalBody(payload)?.attemptId ?? '').slice(0, 40);
  const phase = signalPhase(type, payload);
  if (type === 'state') {
    if (phase) await rememberPeerLink(conversationId, userId, attemptId, phase);
    return { id: 'state' };
  }
  await sweepSignals(conversationId, type !== 'ice');
  const row = await db.worldSignal.create({
    data: { conversationId, fromId: userId, type, attemptId, payload },
  });
  if (phase) await rememberPeerLink(conversationId, userId, attemptId, phase);
  return row;
}

export async function pullSignals(userId: string, conversationId: string, after?: string, live = false) {
  const c = await requireParticipantForSignal(userId, conversationId);
  const otherId = c.userAId === userId ? c.userBId : c.userAId;
  const cursorAt = new Date();
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
  const peerRow = await db.worldPeerLink.findUnique({
    where: { conversationId_userId: { conversationId, userId: otherId } },
    select: { attemptId: true, phase: true, updatedAt: true },
  });
  const peer = peerRow
    ? { attemptId: peerRow.attemptId, phase: peerRow.phase, updatedAt: peerRow.updatedAt.toISOString() }
    : null;

  if (!since) {
    const [control, ice] = await Promise.all([
      db.worldSignal.findMany({
        where: { conversationId, fromId: otherId, type: { in: ['offer', 'answer', 'restart'] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      db.worldSignal.findMany({
        where: { conversationId, fromId: otherId, type: 'ice', createdAt: { gte: new Date(cursorAt.getTime() - 30_000) } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
    ]);
    const byId = new Map<string, (typeof control)[number]>();
    for (const row of [...control.reverse(), ...ice]) byId.set(row.id, row);
    const ordered = [...byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { signals: ordered.map(mapSignal), cursor: cursorAt.toISOString(), peer };
  }

  const rows = await db.worldSignal.findMany({
    where: {
      conversationId,
      fromId: otherId,
      createdAt: { gt: since },
      ...(live ? { type: { in: ['ice', 'restart', 'offer'] } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });
  const signals = rows.map(mapSignal);
  if (!live) {
    const haveOffer = rows.some((s) => s.type === 'offer');
    const haveAnswer = rows.some((s) => s.type === 'answer');
    const [offer, answer] = await Promise.all([
      haveOffer
        ? null
        : db.worldSignal.findFirst({
            where: { conversationId, fromId: otherId, type: 'offer' },
            orderBy: { createdAt: 'desc' },
          }),
      haveAnswer
        ? null
        : db.worldSignal.findFirst({
            where: { conversationId, fromId: otherId, type: 'answer' },
            orderBy: { createdAt: 'desc' },
          }),
    ]);
    for (const row of [offer, answer]) {
      if (row && !rows.some((s) => s.id === row.id)) signals.push(mapSignal(row));
    }
    signals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return {
    signals,
    cursor: rows.at(-1)?.createdAt.toISOString() ?? after ?? cursorAt.toISOString(),
    peer,
  };
}

export async function listPeople(viewerId: string) {
  await warmCafeGuests();
  const [banned, met] = await Promise.all([blockedIds(viewerId), metPartnerIds(viewerId)]);
  const metPeople = met.size
    ? await db.user.findMany({ where: { id: { in: [...met] }, synthetic: false }, select: { id: true } })
    : [];
  const skip = new Set([...banned, ...metPeople.map((person) => person.id)]);
  const users = await db.user.findMany({
    where: {
      id: { not: viewerId, notIn: [...skip] },
      NOT: looseCafeUserFilter(),
      worldProfile: { optedIn: true },
    },
    select: { id: true, name: true, birthDate: true, synthetic: true, ...CARD_INCLUDE },
    orderBy: { worldProfile: { lastSeenAt: 'desc' } },
    take: 160,
  });
  return users.map(cardFromUser).sort((a, b) => Number(a.guest) - Number(b.guest));
}

export function worldLimits(plan: AuthUser['plan']) {
  return { perDay: PLAN_LIMITS[plan].worldConversationsPerDay };
}
