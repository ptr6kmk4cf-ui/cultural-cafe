import { db } from './db';

/** An open table with no one still there is closed after this long. */
export const ABANDON_MS = 3 * 60_000;
const USAGE_KEEP_MS = 35 * 86400_000;
const AUTOPILOT_KEEP_MS = 86400_000;
const QUEUE_FRESH_MS = 90_000;

export type OpenTable = {
  id: string;
  userAId: string;
  userBId: string;
  startedAt: Date;
  endsAt: Date;
  /** Newest sign that someone is still at the table. */
  linkSeenAt: Date | null;
};

/**
 * Tables that are blocking the next sit: the hour is over, nobody is there,
 * or the same person was left in two open tables. The newest live table stays.
 */
export function activeTablesToClose(rows: OpenTable[], now: number): string[] {
  const close = new Set<string>();
  for (const row of rows) {
    const quiet = row.linkSeenAt == null || row.linkSeenAt.getTime() < now - ABANDON_MS;
    const abandoned = row.startedAt.getTime() < now - ABANDON_MS && quiet;
    if (row.endsAt.getTime() <= now || abandoned) close.add(row.id);
  }
  const live = rows
    .filter((row) => !close.has(row.id))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const seated = new Set<string>();
  for (const row of live) {
    if (seated.has(row.userAId) || seated.has(row.userBId)) close.add(row.id);
    else {
      seated.add(row.userAId);
      seated.add(row.userBId);
    }
  }
  return [...close];
}

async function closeTables(ids: string[], now: Date) {
  if (!ids.length) return;
  await db.worldConversation.updateMany({
    where: { id: { in: ids }, status: 'ACTIVE' },
    data: { status: 'ENDED', endedAt: now },
  });
  await Promise.all([
    db.worldMessage.deleteMany({ where: { conversationId: { in: ids } } }),
    db.worldSignal.deleteMany({ where: { conversationId: { in: ids } } }),
    db.worldPeerLink.deleteMany({ where: { conversationId: { in: ids } } }),
    db.worldInvite.deleteMany({ where: { conversationId: { in: ids } } }),
  ]);
}

/**
 * Detects the stuck states this app knows how to fix, then repairs them.
 * Past contacts, blocks, reports, topics, contacts, messages, photos, and
 * memories are left in place.
 */
export async function runAutoRepair(nowMs = Date.now()): Promise<string[]> {
  const now = new Date(nowMs);
  const repairs: string[] = [];
  const open = await db.worldConversation.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      startedAt: true,
      endsAt: true,
      links: { select: { updatedAt: true } },
    },
  });
  const closing = activeTablesToClose(open.map((row) => ({
    id: row.id,
    userAId: row.userAId,
    userBId: row.userBId,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
    linkSeenAt: row.links.reduce<Date | null>((latest, link) => {
      if (!latest || link.updatedAt > latest) return link.updatedAt;
      return latest;
    }, null),
  })), nowMs);
  if (closing.length) {
    await closeTables(closing, now);
    repairs.push(`closed ${closing.length} stuck table${closing.length === 1 ? '' : 's'}`);
  }

  const stillOpen = await db.worldConversation.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  const liveIds = stillOpen.map((row) => row.id);
  const finished = ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'] as const;
  const expiredInvites = await db.worldInvite.deleteMany({ where: { status: 'PENDING', expiresAt: { lt: now } } });
  const doneInvites = liveIds.length
    ? await db.worldInvite.deleteMany({
        where: {
          status: { in: [...finished] },
          OR: [{ conversationId: null }, { conversationId: { notIn: liveIds } }],
        },
      })
    : await db.worldInvite.deleteMany({ where: { status: { in: [...finished] } } });
  const invites = expiredInvites.count + doneInvites.count;
  if (invites) repairs.push(`discarded ${invites} finished invite${invites === 1 ? '' : 's'}`);

  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  if (sessions.count) repairs.push(`discarded ${sessions.count} expired sign-in${sessions.count === 1 ? '' : 's'}`);

  const usage = await db.aiUsage.deleteMany({ where: { createdAt: { lt: new Date(nowMs - USAGE_KEEP_MS) } } });
  if (usage.count) repairs.push(`discarded ${usage.count} old AI log${usage.count === 1 ? '' : 's'}`);

  const autopilot = await db.autopilotEvent.deleteMany({ where: { createdAt: { lt: new Date(nowMs - AUTOPILOT_KEEP_MS) } } });
  if (autopilot.count) repairs.push(`discarded ${autopilot.count} old autopilot note${autopilot.count === 1 ? '' : 's'}`);

  const queue = await db.worldProfile.updateMany({
    where: { available: true, lastSeenAt: { lt: new Date(nowMs - QUEUE_FRESH_MS) } },
    data: { available: false, queuedAt: null },
  });
  if (queue.count) repairs.push(`cleared ${queue.count} abandoned queue spot${queue.count === 1 ? '' : 's'}`);

  await db.worldSignal.deleteMany({ where: { conversation: { status: { not: 'ACTIVE' } } } });
  await db.worldPeerLink.deleteMany({ where: { conversation: { status: { not: 'ACTIVE' } } } });
  return repairs;
}
