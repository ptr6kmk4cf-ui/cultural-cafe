import type { Plan } from '@prisma/client';
import { db } from './db';
import { HttpError } from './http';

export interface PlanLimits {
  label: string;
  priceLabel: string;
  aiRequestsPerDay: number;
  maxPhotos: number;
  maxActiveContacts: number;
  autopilot: boolean;
  photoAnalysis: boolean;
  worldConversationsPerDay: number;
  worldAssist: boolean;
  worldAutopilot: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    label: 'Free',
    priceLabel: '€0',
    aiRequestsPerDay: 300,
    maxPhotos: 30,
    maxActiveContacts: 15,
    autopilot: false,
    photoAnalysis: false,
    worldConversationsPerDay: 2,
    worldAssist: true,
    worldAutopilot: true,
  },
  PREMIUM: {
    label: 'Premium',
    priceLabel: '€14.99 / month',
    aiRequestsPerDay: 600,
    maxPhotos: 500,
    maxActiveContacts: 500,
    autopilot: true,
    photoAnalysis: true,
    worldConversationsPerDay: 20,
    worldAssist: true,
    worldAutopilot: true,
  },
};

export function assertWorldAutomation(userId: string, plan: Plan, kind: 'assist' | 'autopilot') {
  const limits = PLAN_LIMITS[plan];
  const allowed = kind === 'autopilot' ? limits.worldAutopilot : limits.worldAssist;
  if (!allowed) {
    throw new HttpError(
      402,
      kind === 'autopilot'
        ? 'Running the whole table is a Premium feature (€14.99/month). Upgrade to let Cultural Café write and send for you — the other person is always told.'
        : 'AI-written Café replies are a Premium feature (€14.99/month). Upgrade to get a draft; you still press send.',
      'premium_required',
    );
  }
  return assertAiQuota(userId, plan);
}

export async function assertWorldQuota(userId: string, plan: Plan) {
  const since = new Date(Date.now() - 86400_000);
  const used = await db.worldConversation.count({
    where: { startedAt: { gte: since }, OR: [{ userAId: userId }, { userBId: userId }] },
  });
  if (used >= PLAN_LIMITS[plan].worldConversationsPerDay) {
    throw new HttpError(
      402,
      `Daily Café conversations reached for the ${PLAN_LIMITS[plan].label} plan (${PLAN_LIMITS[plan].worldConversationsPerDay}/24h).`,
      'world_quota',
    );
  }
  return { used, limit: PLAN_LIMITS[plan].worldConversationsPerDay };
}

export async function assertAiQuota(userId: string, plan: Plan) {
  const since = new Date(Date.now() - 86400_000);
  const used = await db.aiUsage.count({ where: { userId, createdAt: { gte: since }, success: true } });
  if (used >= PLAN_LIMITS[plan].aiRequestsPerDay) {
    throw new HttpError(
      402,
      `Daily AI limit reached for the ${PLAN_LIMITS[plan].label} plan (${PLAN_LIMITS[plan].aiRequestsPerDay}/24h).`,
      'quota_exceeded',
    );
  }
  return { used, limit: PLAN_LIMITS[plan].aiRequestsPerDay };
}
