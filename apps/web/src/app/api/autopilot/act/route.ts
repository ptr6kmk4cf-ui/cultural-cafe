import { z } from 'zod';
import { requireUser, type AuthUser } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { loadPersona } from '@/lib/ai/persona';
import { generateOpeners } from '@/lib/ai/tasks';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { assertCapability } from '@/lib/platform';
import { addMessage, createContact, syncThread } from '@/lib/services/contacts';
import { decideAutopilot, getAutopilotSettings, logAutopilot, needsDisclosure } from '@/lib/services/autopilot';
import { replyForContact } from '@/lib/services/reply';
import { zProfileInput, zThreadSnapshot } from '@/lib/validation';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reply'), platform: z.string(), snapshot: zThreadSnapshot }),
  z.object({ kind: z.literal('first_contact'), platform: z.string(), profile: zProfileInput }),
]);

type Outcome =
  | { action: 'send'; text: string; contactId: string; remainingToday?: number }
  | { action: 'skip' | 'blocked' | 'escalate' | 'stopped'; reason: string; contactId?: string; suggestion?: string };

/**
 * One Autopilot step. The server decides whether the step is allowed, generates
 * the message, records it, and only then tells the extension to send it.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, Body);
  assertCapability(b.platform, 'autoSend');
  const out = b.kind === 'reply' ? await doReply(user, b.platform, b.snapshot) : await doFirstContact(user, b.platform, b.profile);
  return json(out);
});

async function withDisclosure(userId: string, contactId: string, text: string) {
  if (!(await needsDisclosure(contactId))) return text;
  const s = await getAutopilotSettings(userId);
  return `${text}\n\n${s.disclosureText}`;
}

async function doReply(user: AuthUser, platform: string, snapshot: z.infer<typeof zThreadSnapshot>): Promise<Outcome> {
  if (snapshot.messages.at(-1)?.direction !== 'IN') return { action: 'skip', reason: 'No new incoming message.' };
  const synced = await syncThread(user, snapshot, { create: true });
  const contact = synced!.contact;

  const decision = await decideAutopilot(user, { platform, action: 'reply', contact });
  if (!decision.allowed) return { action: 'blocked', reason: decision.reason, contactId: contact.id };

  const r = await replyForContact(user, contact, { autopilot: true });
  const suggestion = r.suggestions[0]?.text;

  if (r.intent.stopRequested || r.intent.rejection) {
    await logAutopilot(user.id, platform, 'escalated', contact.id, 'Contact declined / asked to stop. Marked do-not-contact.');
    return { action: 'stopped', reason: `${contact.name} declined or asked to stop. Autopilot will not message them again.`, contactId: contact.id, suggestion };
  }
  if (r.intent.needsHuman || r.needsUserInput || !suggestion) {
    const reason = r.intent.needsHumanReason || r.needsUserInput || 'The AI was not confident about a reply.';
    await db.contact.update({ where: { id: contact.id }, data: { humanTakeover: true } });
    await logAutopilot(user.id, platform, 'escalated', contact.id, reason);
    return { action: 'escalate', reason, contactId: contact.id, suggestion };
  }

  const text = await withDisclosure(user.id, contact.id, suggestion);
  await addMessage(contact.id, { direction: 'OUT', text, aiGenerated: true, autopilot: true, language: r.replyLanguage });
  await logAutopilot(user.id, platform, 'reply', contact.id, `Replied to ${contact.name}`);
  return { action: 'send', text, contactId: contact.id, remainingToday: decision.remainingToday };
}

async function doFirstContact(user: AuthUser, platform: string, profile: z.infer<typeof zProfileInput>): Promise<Outcome> {
  assertCapability(platform, 'discovery');
  const match = await db.matchCandidate.findFirst({ where: { userId: user.id, platform, externalId: profile.externalId } });
  if (!match) return { action: 'blocked', reason: 'Only screened, shortlisted matches can be contacted by Autopilot.' };

  let contact = await db.contact.findFirst({ where: { userId: user.id, platform, externalId: profile.externalId } });
  const decision = await decideAutopilot(user, { platform, action: 'first_contact', contact });
  if (!decision.allowed) return { action: 'blocked', reason: decision.reason, contactId: contact?.id };

  if (!contact) {
    contact = await createContact(user, {
      name: profile.name,
      platform,
      externalId: profile.externalId,
      profileNotes: decrypt(match.summary),
      source: 'MATCH',
    });
  }
  await db.matchCandidate.update({ where: { id: match.id }, data: { status: 'CONTACTED', contactId: contact.id } });

  const { persona, lang } = await loadPersona(user.id);
  const language = contact.language ?? (lang.defaultMode !== 'SELECTED' && profile.language ? profile.language : lang.defaultReplyLanguage);
  const { openers } = await generateOpeners({
    myLanguage: lang.myLanguage,
    user,
    persona,
    profile: { ...profile, notes: null },
    language,
    objective: contact.objective,
  });
  if (!openers.length) {
    await logAutopilot(user.id, platform, 'escalated', contact.id, 'No safe opener generated');
    return { action: 'escalate', reason: 'Could not generate a safe opener.', contactId: contact.id };
  }
  const text = await withDisclosure(user.id, contact.id, openers[0].text);
  await addMessage(contact.id, { direction: 'OUT', text, aiGenerated: true, autopilot: true, language });
  await logAutopilot(user.id, platform, 'first_contact', contact.id, `Opened conversation with ${contact.name}`);
  return { action: 'send', text, contactId: contact.id, remainingToday: decision.remainingToday };
}
