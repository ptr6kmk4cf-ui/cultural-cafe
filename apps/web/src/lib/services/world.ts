import type { WorldConversation, WorldInvite, WorldMessage, WorldProfile } from '@prisma/client';
import { cafePromptFor, languageName } from '@conversa/shared';
import type { AuthUser } from '../auth';
import { ageFromBirthDate } from '../auth';
import { decrypt, encrypt, encryptOptional } from '../crypto';
import { db } from '../db';
import { HttpError, notFound } from '../http';
import { PLAN_LIMITS, assertWorldQuota } from '../plans';
import { detectLanguageHeuristic, normalizeLang } from '../ai/lang';
import { translateText } from '../ai/tasks';
import { detectSensitiveRequest } from '../ai/safety';

export const WORLD_SESSION_MS = 60 * 60_000;
export const WORLD_INVITE_MS = 10 * 60_000;
export const WORLD_QUEUE_FRESH_MS = 90_000;
export const WORLD_ONLINE_MS = 45_000;

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'Traveler';
}

export async function getOrCreateProfile(userId: string) {
  return db.worldProfile.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function touchPresence(userId: string, available?: boolean) {
  const data: { lastSeenAt: Date; available?: boolean; queuedAt?: Date | null } = { lastSeenAt: new Date() };
  if (available === false) {
    data.available = false;
    data.queuedAt = null;
  } else if (available === true) {
    data.available = true;
  }
  return db.worldProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
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

export async function isBlocked(a: string, b: string) {
  return !!(await db.worldBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  }));
}

export async function expireStale() {
  const now = new Date();
  await db.worldInvite.updateMany({ where: { status: 'PENDING', expiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
  const due = await db.worldConversation.findMany({
    where: { status: 'ACTIVE', endsAt: { lt: now } },
    select: { id: true },
  });
  if (due.length) {
    const ids = due.map((c) => c.id);
    await db.worldConversation.updateMany({ where: { id: { in: ids } }, data: { status: 'ENDED', endedAt: now } });
    await db.worldMessage.deleteMany({ where: { conversationId: { in: ids } } });
  }
  await db.worldProfile.updateMany({
    where: { available: true, lastSeenAt: { lt: new Date(Date.now() - WORLD_QUEUE_FRESH_MS) } },
    data: { available: false, queuedAt: null },
  });
}

export async function activeConversation(userId: string) {
  await expireStale();
  return db.worldConversation.findFirst({
    where: { status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }] },
  });
}

export async function pendingInvites(userId: string) {
  await expireStale();
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
    personality: { displayName: string | null; interests: string[] } | null;
    language: { myLanguage: string; preferredLanguages: string[] } | null;
    worldProfile: { city: string; country: string; bio: string; portraitPhotoId: string | null; lastSeenAt: Date; available: boolean } | null;
  },
) {
  const online = u.worldProfile ? Date.now() - u.worldProfile.lastSeenAt.getTime() < WORLD_ONLINE_MS : false;
  return {
    id: u.id,
    name: firstName(u.personality?.displayName || u.name),
    age: ageFromBirthDate(u.birthDate),
    city: u.worldProfile?.city ?? '',
    country: u.worldProfile?.country ?? '',
    bio: u.worldProfile ? decrypt(u.worldProfile.bio) : '',
    language: u.language?.myLanguage ?? 'en',
    languageLabel: languageName(u.language?.myLanguage ?? 'en'),
    languages: u.language?.preferredLanguages ?? [u.language?.myLanguage ?? 'en'],
    interests: u.personality?.interests ?? [],
    portraitUrl: u.worldProfile?.portraitPhotoId ? `/api/world/people/${u.id}/portrait` : null,
    online,
    available: !!(u.worldProfile?.available && online),
  };
}

async function loadUserCard(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: { personality: true, language: true, worldProfile: true },
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

export function serializeProfile(p: WorldProfile) {
  return {
    optedIn: p.optedIn,
    available: p.available,
    city: p.city,
    country: p.country,
    bio: decrypt(p.bio),
    portraitPhotoId: p.portraitPhotoId,
    lastSeenAt: p.lastSeenAt,
  };
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
    peer: await publicCard(otherId, me),
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

export async function serializeConversation(c: WorldConversation, me: string) {
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
    prompt: cafePromptFor(c.id),
    peer: await cafePeerCard(await peerId(c, me), me),
  };
}

export function serializeMessage(m: WorldMessage, me: string) {
  const mine = m.senderId === me;
  return {
    id: m.id,
    mine,
    text: decrypt(m.text),
    language: m.language,
    translation: mine ? null : decrypt(m.translation),
    translationLang: mine ? null : m.translationLang,
    flagged: m.flagged,
    createdAt: m.createdAt,
  };
}

export async function joinQueue(user: AuthUser) {
  const profile = await getOrCreateProfile(user.id);
  if (!profile.optedIn) throw new HttpError(400, 'Join the Café and add a city before matching.', 'world_opt_in');
  if (!profile.city.trim()) throw new HttpError(400, 'Add the city you are in (self-stated) before matching.', 'world_city');
  const active = await activeConversation(user.id);
  if (active) return { state: 'chatting' as const, conversation: await serializeConversation(active, user.id) };
  const pending = await pendingInvites(user.id);
  if (pending.length) return { state: 'pending' as const, invites: await Promise.all(pending.map((i) => serializeInvite(i, user.id))) };

  await assertWorldQuota(user.id, user.plan);
  await touchPresence(user.id, true);
  await db.worldProfile.update({ where: { userId: user.id }, data: { queuedAt: new Date(), available: true, lastSeenAt: new Date() } });

  const banned = await blockedIds(user.id);
  const fresh = new Date(Date.now() - WORLD_QUEUE_FRESH_MS);
  const candidates = await db.worldProfile.findMany({
    where: {
      optedIn: true,
      available: true,
      queuedAt: { gte: fresh },
      userId: { not: user.id, notIn: [...banned] },
    },
    take: 20,
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
  const partner = candidates.find((c) => !busy.has(c.userId));
  if (!partner) return { state: 'queued' as const, invites: [] };

  const invite = await db.worldInvite.create({
    data: {
      kind: 'RANDOM',
      fromId: partner.userId,
      toId: user.id,
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
  await db.worldInvite.updateMany({
    where: { kind: 'RANDOM', status: 'PENDING', OR: [{ fromId: userId }, { toId: userId }] },
    data: { status: 'CANCELLED' },
  });
}

export async function inviteFromBrowse(user: AuthUser, toId: string) {
  if (toId === user.id) throw new HttpError(400, 'You cannot invite yourself.');
  const theirs = await db.worldProfile.findUnique({ where: { userId: toId } });
  if (!theirs?.optedIn) throw notFound();
  if (await isBlocked(user.id, toId)) throw new HttpError(403, 'You cannot contact this person.', 'blocked');
  const active = await activeConversation(user.id);
  if (active) throw new HttpError(409, 'Finish your current World conversation first.', 'busy');
  if (await activeConversation(toId)) throw new HttpError(409, 'They are already in a conversation.', 'they_busy');
  const existing = await db.worldInvite.findFirst({
    where: { status: 'PENDING', OR: [{ fromId: user.id, toId }, { fromId: toId, toId: user.id }] },
  });
  if (existing) return serializeInvite(existing, user.id);
  await assertWorldQuota(user.id, user.plan);
  const invite = await db.worldInvite.create({
    data: {
      kind: 'BROWSE',
      fromId: user.id,
      toId,
      acceptedByFrom: true,
      expiresAt: new Date(Date.now() + WORLD_INVITE_MS),
    },
  });
  return serializeInvite(invite, user.id);
}

export async function respondInvite(user: AuthUser, inviteId: string, accept: boolean) {
  const inv = await db.worldInvite.findUnique({ where: { id: inviteId } });
  if (!inv || (inv.fromId !== user.id && inv.toId !== user.id)) throw notFound();
  if (inv.status !== 'PENDING') throw new HttpError(409, 'This invitation is no longer pending.', 'stale');
  if (inv.expiresAt < new Date()) {
    await db.worldInvite.update({ where: { id: inv.id }, data: { status: 'EXPIRED' } });
    throw new HttpError(410, 'This invitation expired.', 'expired');
  }
  if (!accept) {
    await db.worldInvite.update({ where: { id: inv.id }, data: { status: 'DECLINED' } });
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
  await assertWorldQuota(user.id, user.plan);
  const otherId = iAmFrom ? inv.toId : inv.fromId;
  if (await activeConversation(user.id) || await activeConversation(otherId)) {
    throw new HttpError(409, 'One of you is already in a conversation.', 'busy');
  }
  const [a, b] = [inv.fromId, inv.toId].sort();
  const conv = await db.worldConversation.create({
    data: { userAId: a, userBId: b, endsAt: new Date(Date.now() + WORLD_SESSION_MS) },
  });
  await db.worldInvite.update({
    where: { id: inv.id },
    data: { ...next, status: 'ACCEPTED', conversationId: conv.id },
  });
  await db.worldProfile.updateMany({
    where: { userId: { in: [inv.fromId, inv.toId] } },
    data: { available: false, queuedAt: null },
  });
  return { status: 'ACCEPTED' as const, conversation: await serializeConversation(conv, user.id) };
}

export async function endConversation(userId: string, conversationId: string) {
  const c = await requireParticipant(userId, conversationId);
  if (c.status !== 'ACTIVE') return c;
  return db.worldConversation.update({
    where: { id: c.id },
    data: { status: 'ENDED', endedAt: new Date(), endedById: userId },
  }).then(async (ended) => {
    await db.worldMessage.deleteMany({ where: { conversationId: c.id } });
    return ended;
  });
}

/** Translate the line into the other person's language and keep it until the hour ends. */
export async function prepareWorldMessage(user: AuthUser, conversationId: string, text: string) {
  const c = await requireParticipant(user.id, conversationId);
  if (c.status !== 'ACTIVE' || c.endsAt < new Date()) {
    if (c.status === 'ACTIVE') {
      await db.worldConversation.update({ where: { id: c.id }, data: { status: 'ENDED', endedAt: new Date() } });
      await db.worldMessage.deleteMany({ where: { conversationId: c.id } });
    }
    throw new HttpError(409, 'This hour is over.', 'ended');
  }
  const other = await peerId(c, user.id);
  const otherLang = (await db.languageSettings.findUnique({ where: { userId: other } }))?.myLanguage ?? 'en';
  const myLang = (await db.languageSettings.findUnique({ where: { userId: user.id } }))?.myLanguage ?? 'en';
  const detected = normalizeLang(detectLanguageHeuristic(text, myLang), myLang);
  let translation: string | null = null;
  let translationLang: string | null = null;
  if (detected !== otherLang) {
    try {
      const t = await translateText(user, text, otherLang);
      translation = t.translation?.trim() || null;
      translationLang = translation ? otherLang : null;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      translation = null;
    }
    if (!translation) throw new HttpError(503, 'Could not translate that line. Tap Send again.', 'translate_failed');
  }
  const row = await db.worldMessage.create({
    data: {
      conversationId,
      senderId: user.id,
      text: encrypt(text),
      language: detected,
      translation: encryptOptional(translation),
      translationLang,
      flagged: detectSensitiveRequest(text),
    },
  });
  return {
    id: row.id,
    text,
    language: detected,
    translation,
    translationLang,
    flagged: row.flagged,
    createdAt: row.createdAt.toISOString(),
    mine: true,
  };
}

export async function listWorldMessages(userId: string, conversationId: string) {
  await requireParticipant(userId, conversationId);
  const rows = await db.worldMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.reverse().map((m) => ({
    id: m.id,
    mine: m.senderId === userId,
    text: decrypt(m.text),
    language: m.language,
    translation: m.translation ? decrypt(m.translation) : null,
    translationLang: m.translationLang,
    flagged: m.flagged,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function postSignal(userId: string, conversationId: string, type: string, payload: string) {
  await requireParticipant(userId, conversationId);
  await db.worldSignal.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 120_000) } } });
  return db.worldSignal.create({ data: { conversationId, fromId: userId, type, payload } });
}

export async function pullSignals(userId: string, conversationId: string, after?: string) {
  await requireParticipant(userId, conversationId);
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : new Date(Date.now() - 90_000);
  const rows = await db.worldSignal.findMany({
    where: { conversationId, fromId: { not: userId }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return rows.reverse().map((s) => ({ id: s.id, type: s.type, payload: s.payload, createdAt: s.createdAt.toISOString() }));
}

export async function listPeople(viewerId: string) {
  const banned = await blockedIds(viewerId);
  const profiles = await db.worldProfile.findMany({
    where: { optedIn: true, userId: { not: viewerId, notIn: [...banned] } },
    orderBy: { lastSeenAt: 'desc' },
    take: 60,
  });
  const cards = (await Promise.all(profiles.map((p) => publicCard(p.userId, viewerId)))).filter(Boolean);
  return cards;
}

export function worldLimits(plan: AuthUser['plan']) {
  return { perDay: PLAN_LIMITS[plan].worldConversationsPerDay };
}
