import type { Contact } from '@prisma/client';
import type { ReplyResponse } from '@conversa/shared';
import type { AuthUser } from '../auth';
import { db } from '../db';
import { decrypt } from '../crypto';
import { loadPersona } from '../ai/persona';
import { generateReply, type HistoryMessage } from '../ai/tasks';
import { applyMemoryUpdates } from './contacts';

/**
 * Builds the full reply context for a contact (persona, language rules, memory,
 * history, approved photos), calls the AI and applies memory / consent updates.
 */
export async function replyForContact(
  user: AuthUser,
  contact: Contact,
  opts: { extraIncoming?: string | null; instruction?: string | null; autopilot?: boolean } = {},
): Promise<ReplyResponse & { needsUserInput: string | null; raw: Awaited<ReturnType<typeof generateReply>> }> {
  const { persona, lang } = await loadPersona(user.id);
  const [messages, memories, photos] = await Promise.all([
    db.message.findMany({ where: { contactId: contact.id }, orderBy: { sentAt: 'desc' }, take: 30 }),
    db.memoryItem.findMany({ where: { contactId: contact.id, resolved: false }, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.photo.findMany({ where: { userId: user.id, aiApproved: true, category: { not: 'PRIVATE' } }, take: 40, orderBy: { createdAt: 'desc' } }),
  ]);

  const history: HistoryMessage[] = messages.reverse().map((m) => ({ direction: m.direction, text: decrypt(m.text) }));
  if (opts.extraIncoming) history.push({ direction: 'IN', text: opts.extraIncoming });

  const mode = contact.languageMode ?? lang.defaultMode;
  const target = contact.language ?? lang.defaultReplyLanguage;

  const sharedPhotoIds = memories.filter((m) => m.kind === 'PHOTO_SHARED').map((m) => decrypt(m.content));
  const result = await generateReply({
    user,
    persona,
    myLanguage: lang.myLanguage,
    mode,
    targetLanguage: target,
    contact: { name: contact.name, notes: decrypt(contact.profileNotes), objective: contact.objective, style: contact.style },
    memory: memories.filter((m) => m.kind !== 'PHOTO_SHARED').map((m) => ({ kind: m.kind, content: decrypt(m.content) })),
    history,
    photos: photos.map((p) => ({ id: p.id, caption: p.caption, tags: p.tags, category: p.category })),
    sharedPhotoIds,
    autopilot: opts.autopilot,
    instruction: opts.instruction,
  });

  const memoryAdded = await applyMemoryUpdates(contact.id, result.memory, result.answeredQuestions);

  const updates: Partial<Contact> = {};
  if (result.intent.stopRequested || result.intent.rejection) updates.doNotContact = true;
  if (!contact.language && mode !== 'SELECTED' && result.detectedLanguage) updates.language = result.detectedLanguage;
  if (Object.keys(updates).length) await db.contact.update({ where: { id: contact.id }, data: updates });

  return {
    suggestions: result.suggestions.map((s) => ({ text: s.text, translation: s.translation ?? null })),
    detectedLanguage: result.detectedLanguage,
    replyLanguage: result.replyLanguage,
    incomingTranslation: result.incomingTranslation ?? null,
    intent: { ...result.intent, needsHumanReason: result.intent.needsHumanReason ?? null },
    photoSuggestion: result.photo ? { photoId: result.photo.photoId, caption: result.photo.caption, reason: result.photo.reason } : null,
    memoryAdded,
    mockAi: result.mock,
    needsUserInput: result.needsUserInput ?? null,
    raw: result,
  };
}
