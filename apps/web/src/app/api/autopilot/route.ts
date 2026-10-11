import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { PLAN_LIMITS } from '@/lib/plans';
import { getAutopilotSettings } from '@/lib/services/autopilot';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const settings = await getAutopilotSettings(user.id);
  const since = new Date(Date.now() - 86400_000);
  const [firstContacts, replies, events] = await Promise.all([
    db.autopilotEvent.count({ where: { userId: user.id, action: 'first_contact', createdAt: { gte: since } } }),
    db.autopilotEvent.count({ where: { userId: user.id, action: 'reply', createdAt: { gte: since } } }),
    db.autopilotEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return json({
    settings,
    eligible: PLAN_LIMITS[user.plan].autopilot || user.role === 'ADMIN',
    today: { firstContacts, replies },
    events,
  });
});

const Body = z.object({
  enabled: z.boolean(),
  dailyFirstContactLimit: z.number().int().min(0).max(50),
  dailyReplyLimit: z.number().int().min(0).max(300),
  minDelaySeconds: z.number().int().min(5).max(3600),
  disclosureText: z.string().trim().min(10).max(200),
});

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, Body);
  if (b.enabled && !PLAN_LIMITS[user.plan].autopilot && user.role !== 'ADMIN') {
    throw new HttpError(402, 'Autopilot requires the Premium plan.', 'plan_required');
  }
  const settings = await db.autopilotSettings.upsert({
    where: { userId: user.id },
    // Turning Autopilot on is an explicit act that also clears a previous emergency stop.
    update: { ...b, ...(b.enabled ? { emergencyStop: false } : {}) },
    create: { ...b, userId: user.id },
  });
  return json({ settings });
});
