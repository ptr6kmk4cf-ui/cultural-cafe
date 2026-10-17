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

export function assertWorldAutomation(userId: string, plan: Plan, kind: 'assist' | 'autopilot', role?: string) {
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
  return assertAiQuota(userId, plan, role);
}

/** A table is not counted against a daily cap. Anyone can sit down again. */
export async function assertWorldQuota(_userId: string, _plan: Plan) {
  return { used: 0, limit: null };
}

/**
 * Daily AI requests for a plan. AI_DAILY_LIMIT_FREE / AI_DAILY_LIMIT_PREMIUM override the
 * built-in numbers; "0", "off" or "unlimited" removes the cap. Returns null for no cap.
 */
export function dailyAiLimit(plan: Plan): number | null {
  const raw = (process.env[`AI_DAILY_LIMIT_${plan}`] || '').trim().toLowerCase();
  if (raw === '0' || raw === 'off' || raw === 'unlimited' || raw === 'none') return null;
  const n = Number(raw);
  if (raw && Number.isFinite(n) && n > 0) return Math.floor(n);
  return PLAN_LIMITS[plan].aiRequestsPerDay;
}

/** Admins run the café and test it all day, so they have no daily AI cap. */
export async function assertAiQuota(userId: string, plan: Plan, role?: string) {
  const limit = role === 'ADMIN' ? null : dailyAiLimit(plan);
  if (limit === null) return { used: 0, limit: null };
  const since = new Date(Date.now() - 86400_000);
  const used = await db.aiUsage.count({ where: { userId, createdAt: { gte: since }, success: true } });
  if (used >= limit) {
    throw new HttpError(
      402,
      `Daily AI limit reached for the ${PLAN_LIMITS[plan].label} plan (${limit}/24h).`,
      'quota_exceeded',
    );
  }
  return { used, limit };
}
