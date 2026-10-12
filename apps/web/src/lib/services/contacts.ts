import type { Contact, LanguageMode, MemoryItem, Message, Prisma } from '@prisma/client';
import type { ThreadSnapshot } from '@conversa/shared';
import { db } from '../db';
import { decrypt, encrypt, encryptOptional } from '../crypto';
import { HttpError, notFound } from '../http';
import { PLAN_LIMITS } from '../plans';
import type { AuthUser } from '../auth';

function isUniqueViolation(err: unknown) {
  return (err as { code?: string })?.code === 'P2002';
}

/** Every contact lookup is scoped by userId — the core of cross-user isolation. */
export async function getOwnedContact(userId: string, id: string) {
  const c = await db.contact.findFirst({ where: { id, userId } });
  if (!c) throw notFound();
  return c;
}

export function serializeContact(c: Contact & { _count?: { messages: number } }) {
  return {
    id: c.id,
    name: c.name,
    source: c.source,
    platform: c.platform,
    externalId: c.externalId,
    profileNotes: decrypt(c.profileNotes),
    objective: c.objective,
    language: c.language,
    languageMode: c.languageMode,
    style: c.style,
    status: c.status,
    doNotContact: c.doNotContact,
    humanTakeover: c.humanTakeover,
    autopilotAllowed: c.autopilotAllowed,
    lastActivityAt: c.lastActivityAt,
    createdAt: c.createdAt,
    messageCount: c._count?.messages,
  };
}

export function serializeMessage(m: Message) {
  return {
    id: m.id,
    direction: m.direction,
    text: decrypt(m.text),
    translatedText: m.translatedText ? decrypt(m.translatedText) : null,
    language: m.language,
    aiGenerated: m.aiGenerated,
    autopilot: m.autopilot,
    photoId: m.photoId,
    sentAt: m.sentAt,
  };
}

export function serializeMemory(m: MemoryItem) {
  return { id: m.id, kind: m.kind, content: decrypt(m.content), source: m.source, resolved: m.resolved, createdAt: m.createdAt };
}

export async function assertContactCapacity(user: AuthUser) {
  const active = await db.contact.count({ where: { userId: user.id, status: 'ACTIVE' } });
  const limit = PLAN_LIMITS[user.plan].maxActiveContacts;
  if (active >= limit) {
    throw new HttpError(402, `Your plan allows ${limit} active contacts. Archive some or upgrade.`, 'contact_limit');
  }
}

export interface ContactInput {
  name: string;
  profileNotes?: string;
  objective?: string;
  language?: string | null;
  languageMode?: LanguageMode | null;
  style?: string | null;
  platform?: string | null;
  externalId?: string | null;
  source?: 'MANUAL' | 'MATCH' | 'TRACKED';
}

export async function createContact(user: AuthUser, input: ContactInput) {
  await assertContactCapacity(user);
  if (input.platform && input.externalId) {
    const existing = await db.contact.findFirst({
      where: { userId: user.id, platform: input.platform, externalId: input.externalId },
    });
    if (existing) throw new HttpError(409, 'You already have this person in your contacts.', 'duplicate_contact');
  }
  return db.contact.create({
    data: {
      userId: user.id,
      name: input.name,
      profileNotes: input.profileNotes ? encrypt(input.profileNotes) : '',
      objective: input.objective ?? '',
      language: input.language ?? null,
      languageMode: input.languageMode ?? null,
      style: input.style ?? null,
      platform: input.platform ?? null,
      externalId: input.externalId ?? null,
      source: input.source ?? 'MANUAL',
    },
  });
}

export async function addMessage(
  contactId: string,
  m: { direction: 'IN' | 'OUT'; text: string; translatedText?: string | null; language?: string | null; aiGenerated?: boolean; autopilot?: boolean; externalId?: string | null; photoId?: string | null },
) {
  const msg = await db.message.create({
    data: {
      contactId,
      direction: m.direction,
      text: encrypt(m.text),
      translatedText: encryptOptional(m.translatedText),
      language: m.language ?? null,
      aiGenerated: m.aiGenerated ?? false,
      autopilot: m.autopilot ?? false,
      externalId: m.externalId ?? null,
      photoId: m.photoId ?? null,
    },
  });
  await db.contact.update({ where: { id: contactId }, data: { lastActivityAt: new Date() } });
  if (m.photoId && m.direction === 'OUT') {
    await db.memoryItem.create({ data: { contactId, kind: 'PHOTO_SHARED', content: encrypt(m.photoId), source: 'AI' } });
  }
  return msg;
}

/**
 * Mirrors a conversation thread read from an authorised site into the contact's
 * history (dedupe by the site's message id). Only called for threads the user
 * explicitly tracks — the extension never syncs other browsing.
 */
export async function syncThread(user: AuthUser, snap: ThreadSnapshot, opts: { create: boolean }) {
  let contact = await db.contact.findFirst({
    where: { userId: user.id, platform: snap.platform, externalId: snap.profileExternalId || snap.externalId },
  });
  if (!contact) {
    if (!opts.create) return null;
    const externalId = snap.profileExternalId || snap.externalId;
    try {
      contact = await createContact(user, { name: snap.contactName, platform: snap.platform, externalId, source: 'TRACKED' });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      contact = await db.contact.findFirstOrThrow({ where: { userId: user.id, platform: snap.platform, externalId } });
    }
  }
  const [knownRows, unlinkedRows] = await Promise.all([
    db.message.findMany({
      where: { contactId: contact.id, externalId: { not: null } },
      select: { externalId: true },
    }),
    db.message.findMany({
      where: { contactId: contact.id, externalId: null, direction: 'OUT' },
      select: { id: true, text: true },
      orderBy: { sentAt: 'desc' },
      take: 40,
    }),
  ]);
  const known = new Set(knownRows.map((e) => e.externalId).filter(Boolean) as string[]);
  const unlinkedOut = unlinkedRows.map((e) => ({ id: e.id, text: decrypt(e.text) }));
  let added = 0;
  for (const m of snap.messages.slice(-200)) {
    if (!m.externalId || known.has(m.externalId)) continue;
    const text = m.text.slice(0, 4000);
    if (m.direction === 'OUT') {
      // An Autopilot/assistant message we already recorded before the site assigned it an id.
      const idx = unlinkedOut.findIndex((u) => u.text.trim() === text.trim());
      if (idx !== -1) {
        const linked = await db.message
          .update({ where: { id: unlinkedOut[idx].id }, data: { externalId: m.externalId } })
          .catch((err) => (isUniqueViolation(err) ? null : Promise.reject(err)));
        unlinkedOut.splice(idx, 1);
        if (linked) continue;
      }
    }
    // Concurrent syncs of the same thread (panel refresh + reply request) may race; the
    // (contactId, externalId) unique key makes the loser a no-op instead of an error.
    try {
      await db.message.create({
        data: {
          contactId: contact.id,
          direction: m.direction,
          text: encrypt(text || (m.hasPhoto ? '[photo]' : '')),
          externalId: m.externalId,
          sentAt: m.sentAt ? new Date(m.sentAt) : new Date(),
        },
      });
      added++;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (added) contact = await db.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } });
  return { contact, added };
}

export async function applyMemoryUpdates(
  contactId: string,
  memory: { kind: string; content: string }[],
  answered: string[],
) {
  const current = await db.memoryItem.findMany({ where: { contactId } });
  const seen = new Set(current.map((m) => decrypt(m.content).toLowerCase().trim()));
  const data: Prisma.MemoryItemCreateManyInput[] = [];
  for (const m of memory) {
    const key = m.content.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    data.push({ contactId, kind: m.kind as MemoryItem['kind'], content: encrypt(m.content), source: 'AI' });
  }
  if (data.length) await db.memoryItem.createMany({ data });
  if (answered.length) {
    const ans = new Set(answered.map((a) => a.toLowerCase().trim()));
    const toResolve = current.filter((m) => m.kind === 'QUESTION' && !m.resolved && ans.has(decrypt(m.content).toLowerCase().trim()));
    if (toResolve.length) await db.memoryItem.updateMany({ where: { id: { in: toResolve.map((m) => m.id) } }, data: { resolved: true } });
  }
  return data.length;
}
