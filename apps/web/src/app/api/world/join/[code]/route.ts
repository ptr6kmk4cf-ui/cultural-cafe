import { requireUser } from '@/lib/auth';
import { json, notFound, route } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { claimFriendInvite, lookupFriendInvite } from '@/lib/services/world';

export const GET = route(async (req, { code }: { code: string }) => {
  await rateLimit(`world-join:${clientIp(req)}`, 60, 60 * 60_000);
  const host = await lookupFriendInvite(code);
  if (!host) throw notFound();
  return json({ host: { code: host.code, name: host.name, city: host.city, country: host.country, inCafe: host.inCafe } });
});

export const POST = route(async (req, { code }: { code: string }) => {
  const user = await requireUser(req);
  await rateLimit(`world-join-claim:${user.id}`, 20, 60 * 60_000);
  await claimFriendInvite(user.id, code);
  return json({ ok: true });
});
