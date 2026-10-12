import { cafePromptFor, cafePromptFromPool, type CafePrompt } from '@conversa/shared';
import { db } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { detectSensitiveRequest, looksLikeInjection } from '@/lib/ai/safety';

const TOPIC_MAX = 80;

export function topicKey(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cleanTopicText(raw: string) {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > TOPIC_MAX) {
    throw new HttpError(400, 'Type a short topic, up to 80 characters.', 'topic');
  }
  if (/https?:|www\.|@/i.test(text) || /\d[\d\s().-]{6,}/.test(text)) {
    throw new HttpError(400, 'Leave out links, email addresses, and phone numbers.', 'topic');
  }
  if (detectSensitiveRequest(text) || looksLikeInjection(text)) {
    throw new HttpError(400, 'Keep the topic to everyday life. No money, addresses, or phone numbers.', 'topic');
  }
  return text;
}

/** Saves a topic for a later table. The café page does not list these. */
export async function saveCafeTopic(userId: string, raw: string) {
  const text = cleanTopicText(raw);
  const key = topicKey(text);
  await db.cafeTopicIdea.upsert({
    where: { key },
    update: {},
    create: { userId, text, key },
  });
  return { ok: true as const };
}

export async function tablePromptFor(conversation: { id: string; promptTitle?: string | null; promptQuestion?: string | null }): Promise<CafePrompt> {
  if (conversation.promptTitle && conversation.promptQuestion) {
    return { id: 'saved', title: conversation.promptTitle, question: conversation.promptQuestion };
  }
  return cafePromptFor(conversation.id);
}

/** Pick once, from the built-in list plus topics people have added, and keep that choice. */
export async function assignTablePrompt(conversationId: string) {
  const ideas = await db.cafeTopicIdea.findMany({
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: { id: true, text: true },
  });
  const prompt = cafePromptFromPool(conversationId, ideas);
  return db.worldConversation.update({
    where: { id: conversationId },
    data: { promptTitle: prompt.title, promptQuestion: prompt.question },
  });
}
