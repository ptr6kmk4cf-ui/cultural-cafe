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
  cafeDisplayName,
  serializeProfile,
  touchPresenceIfStale,
  tryOfferFriendHours,
} from '@/lib/services/world';
import { warmCafeGuests } from '@/lib/services/cafe-guests';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  await Promise.all([expireStale(), warmCafeGuests()]);
  let profile = await getOrCreateProfile(user.id);
  profile = await touchPresenceIfStale(profile);
  if (profile.invitedByUserId) await tryOfferFriendHours(user.id);
  const [conv, invites, used] = await Promise.all([
    activeConversation(user.id),
    pendingInvites(user.id),
    db.worldConversation.count({
      where: { startedAt: { gte: new Date(Date.now() - 86400_000) }, OR: [{ userAId: user.id }, { userBId: user.id }] },
    }),
  ]);
  return json({
    profile: serializeProfile(profile, await cafeDisplayName(user.id, user.name)),
    conversation: conv ? await serializeConversation(conv, user.id) : null,
    invites: await Promise.all(invites.map((i) => serializeInvite(i, user.id))),
    quota: { used, limit: PLAN_LIMITS[user.plan].worldConversationsPerDay },
  });
});
