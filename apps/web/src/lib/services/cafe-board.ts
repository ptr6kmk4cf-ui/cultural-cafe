import { boardLinesFromElements, boardLinesToTranslate, type BoardTextElement } from '@conversa/shared';
import { translateText } from '../ai/tasks';
import type { AuthUser } from '../auth';
import { decrypt, encrypt } from '../crypto';
import { db } from '../db';
import { HttpError } from '../http';
import { assignTablePrompt } from './cafe-topics';
import { WORLD_SESSION_MS, activeConversation, endConversation, peerId, requireParticipant } from './world';

const PRACTICE_PARTNER_EMAIL = 'lucia@conversa.local';

function localBoardTools() {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_TOOLS === 'true';
}

const MAX_ELEMENTS = 250;
const MAX_JSON = 180_000;
const MAX_TEXT = 2000;

type Scene = { elements: BoardTextElement[] };

function parseScene(raw: string): Scene {
  try {
    const parsed = JSON.parse(raw) as { elements?: unknown };
    if (!Array.isArray(parsed.elements)) return { elements: [] };
    return { elements: parsed.elements.slice(0, MAX_ELEMENTS) as BoardTextElement[] };
  } catch {
    return { elements: [] };
  }
}

function compactScene(elements: unknown): Scene {
  if (!Array.isArray(elements)) return { elements: [] };
  const next = elements.slice(0, MAX_ELEMENTS).map((el) => {
    const item = el as BoardTextElement;
    if (typeof item?.text === 'string' && item.text.length > MAX_TEXT) {
      return { ...item, text: item.text.slice(0, MAX_TEXT), originalText: String(item.originalText || item.text).slice(0, MAX_TEXT) };
    }
    return item;
  });
  const scene = { elements: next };
  if (JSON.stringify(scene).length > MAX_JSON) {
    throw new HttpError(413, 'That drawing is too large for this table.', 'board_too_large');
  }
  return scene;
}

async function requireLiveBoard(user: AuthUser, conversationId: string) {
  const c = await requireParticipant(user.id, conversationId);
  const peer = await db.user.findUnique({
    where: { id: await peerId(c, user.id) },
    select: { synthetic: true },
  });
  if (peer?.synthetic) throw new HttpError(403, 'The board is for a table with a person.', 'guest_table');
  return c;
}

export async function loadCafeBoard(user: AuthUser, conversationId: string) {
  const c = await requireLiveBoard(user, conversationId);
  const ended = c.status !== 'ACTIVE' || c.endsAt < new Date();
  const [row, mine, theirs] = await Promise.all([
    db.worldBoard.findUnique({ where: { conversationId } }),
    db.languageSettings.findUnique({ where: { userId: user.id }, select: { myLanguage: true } }),
    db.languageSettings.findUnique({ where: { userId: await peerId(c, user.id) }, select: { myLanguage: true } }),
  ]);
  const scene = row ? parseScene(decrypt(row.payload)) : { elements: [] };
  return {
    ended,
    version: row?.version ?? 0,
    elements: scene.elements,
    me: { id: user.id, name: user.name, language: mine?.myLanguage || 'en' },
    peerLanguage: theirs?.myLanguage || 'en',
  };
}

export async function saveCafeBoard(user: AuthUser, conversationId: string, version: number, elements: unknown) {
  const c = await requireLiveBoard(user, conversationId);
  if (c.status !== 'ACTIVE' || c.endsAt < new Date()) {
    throw new HttpError(409, 'This table has closed.', 'ended');
  }
  const scene = compactScene(elements);
  const payload = encrypt(JSON.stringify(scene));
  const current = await db.worldBoard.findUnique({ where: { conversationId } });
  if (!current) {
    try {
      const saved = await db.worldBoard.create({
        data: { conversationId, payload, version: 1 },
      });
      return { conflict: false as const, version: saved.version, elements: scene.elements };
    } catch {
      const row = await db.worldBoard.findUnique({ where: { conversationId } });
      return {
        conflict: true as const,
        version: row?.version ?? 1,
        elements: row ? parseScene(decrypt(row.payload)).elements : scene.elements,
      };
    }
  }
  if (version !== current.version) {
    return { conflict: true as const, version: current.version, elements: parseScene(decrypt(current.payload)).elements };
  }
  const updated = await db.worldBoard.updateMany({
    where: { conversationId, version },
    data: { payload, version: version + 1 },
  });
  if (updated.count === 0) {
    const row = await db.worldBoard.findUnique({ where: { conversationId } });
    return {
      conflict: true as const,
      version: row?.version ?? version,
      elements: row ? parseScene(decrypt(row.payload)).elements : scene.elements,
    };
  }
  return { conflict: false as const, version: version + 1, elements: scene.elements };
}

export async function translateCafeBoard(user: AuthUser, conversationId: string, elements: unknown) {
  await requireLiveBoard(user, conversationId);
  const mine = await db.languageSettings.findUnique({ where: { userId: user.id }, select: { myLanguage: true } });
  const reader = { id: user.id, language: mine?.myLanguage || 'en' };
  const scene = compactScene(elements);
  const needed = boardLinesToTranslate(boardLinesFromElements(scene.elements), reader).slice(0, 20);
  const translations: Record<string, string> = {};
  await Promise.all(
    needed.map(async (line) => {
      try {
        const t = await translateText(user, line.text, reader.language);
        const text = t.translation?.trim();
        if (text) translations[line.id] = text;
      } catch {
        /* leave the original on the board */
      }
    }),
  );
  return { translations };
}

/** Local only: sit with the seeded traveler so the board can be tried from one browser. */
export async function ensurePracticeTable(user: AuthUser) {
  if (!localBoardTools()) throw new HttpError(404, 'Not found');
  const partnerEmail =
    user.email === PRACTICE_PARTNER_EMAIL ? process.env.SEED_DEMO_EMAIL || 'demo@conversa.local' : PRACTICE_PARTNER_EMAIL;
  const partner = await db.user.findUnique({
    where: { email: partnerEmail },
    select: { id: true, synthetic: true },
  });
  if (!partner || partner.synthetic || partner.id === user.id) {
    throw new HttpError(404, 'Seed the local café first (npm run db:seed).', 'no_partner');
  }
  const active = await activeConversation(user.id);
  if (active && (active.userAId === partner.id || active.userBId === partner.id)) {
    return { id: active.id };
  }
  if (active) await endConversation(user.id, active.id);
  const theirs = await activeConversation(partner.id);
  if (theirs) await endConversation(partner.id, theirs.id);
  const [userAId, userBId] = [user.id, partner.id].sort();
  const created = await db.worldConversation.create({
    data: { userAId, userBId, endsAt: new Date(Date.now() + WORLD_SESSION_MS) },
  });
  const conv = await assignTablePrompt(created.id);
  return { id: conv.id };
}
