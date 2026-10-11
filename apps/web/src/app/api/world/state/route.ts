import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { PLAN_LIMITS } from '@/lib/plans';
import {
  activeConversation,
  expireStale,
  getOrCreateProfile,
  pendingInvites,
  serializeConversation,
  serializeInvite,
  serializeProfile,
  touchPresence,
} from '@/lib/services/world';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  await expireStale();
  await touchPresence(user.id);
  const [profile, conv, invites, used] = await Promise.all([
    getOrCreateProfile(user.id),
    activeConversation(user.id),
    pendingInvites(user.id),
    db.worldConversation.count({
      where: { startedAt: { gte: new Date(Date.now() - 86400_000) }, OR: [{ userAId: user.id }, { userBId: user.id }] },
    }),
  ]);
  return json({
    profile: serializeProfile(profile),
    conversation: conv ? await serializeConversation(conv, user.id) : null,
    invites: await Promise.all(invites.map((i) => serializeInvite(i, user.id))),
    quota: { used, limit: PLAN_LIMITS[user.plan].worldConversationsPerDay },
  });
});
