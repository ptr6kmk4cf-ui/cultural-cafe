import type { AutopilotDecision } from '@conversa/shared';
import { getPlatform } from '@conversa/shared';
import type { Contact } from '@prisma/client';
import type { AuthUser } from '../auth';
import { db } from '../db';
import { PLAN_LIMITS } from '../plans';

export async function getAutopilotSettings(userId: string) {
  return db.autopilotSettings.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function logAutopilot(userId: string, platform: string, action: string, contactId: string | null, detail = '') {
  await db.autopilotEvent.create({ data: { userId, platform, action, contactId, detail: detail.slice(0, 500) } });
}

/**
 * Central policy check for every Autopilot action. Enforced server-side so a
 * tampered extension cannot exceed limits or run on unauthorised sites.
 */
export async function decideAutopilot(
  user: AuthUser,
  opts: { platform: string; action: 'first_contact' | 'reply'; contact: Contact | null },
): Promise<AutopilotDecision> {
  const platform = getPlatform(opts.platform);
  if (!platform?.capabilities.autoSend) {
    return { allowed: false, reason: 'Autopilot is not authorised on this site.' };
  }
  if (!PLAN_LIMITS[user.plan].autopilot && user.role !== 'ADMIN') {
    return { allowed: false, reason: 'Autopilot requires the Premium plan.' };
  }
  const s = await getAutopilotSettings(user.id);
  if (s.emergencyStop) return { allowed: false, reason: 'Emergency stop is active.' };
  if (!s.enabled) return { allowed: false, reason: 'Autopilot is turned off.' };

  const c = opts.contact;
  if (c) {
    if (c.doNotContact) return { allowed: false, reason: `${c.name} declined or asked to stop — no further messages.` };
    if (c.humanTakeover) return { allowed: false, reason: `You took over the conversation with ${c.name}.` };
    if (!c.autopilotAllowed) return { allowed: false, reason: `Autopilot is disabled for ${c.name}.` };
    if (c.status === 'ARCHIVED') return { allowed: false, reason: `${c.name} is archived.` };
  }

  if (opts.action === 'first_contact' && c) {
    const sent = await db.message.count({ where: { contactId: c.id, direction: 'OUT' } });
    if (sent > 0) return { allowed: false, reason: `Already contacted ${c.name} (duplicate prevention).` };
  }

  if (c) {
    const last = await db.autopilotEvent.findFirst({
      where: { userId: user.id, contactId: c.id, action: { in: ['first_contact', 'reply'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < s.minDelaySeconds * 1000) {
      return { allowed: false, reason: `Cooling down (min ${s.minDelaySeconds}s between messages to the same person).` };
    }
  }

  const since = new Date(Date.now() - 86400_000);
  const used = await db.autopilotEvent.count({ where: { userId: user.id, action: opts.action, createdAt: { gte: since } } });
  const limit = opts.action === 'first_contact' ? s.dailyFirstContactLimit : s.dailyReplyLimit;
  if (used >= limit) return { allowed: false, reason: `Daily ${opts.action === 'first_contact' ? 'first-contact' : 'reply'} limit (${limit}) reached.` };

  return { allowed: true, reason: 'ok', remainingToday: limit - used - 1 };
}

export async function needsDisclosure(contactId: string) {
  const prior = await db.message.count({ where: { contactId, autopilot: true } });
  return prior === 0;
}
