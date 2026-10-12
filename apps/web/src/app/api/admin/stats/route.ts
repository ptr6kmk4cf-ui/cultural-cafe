import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';

/**
 * Aggregate, non-content metrics only. Admins cannot read users' conversations,
 * memories or photos through this dashboard.
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const day = new Date(Date.now() - 86400_000);
  const month = new Date(Date.now() - 30 * 86400_000);
  const [users, premium, newUsers, ai24h, aiByFeature, aiFailures, tickets, contacts, autopilot24h, worldActive, worldReports] = await Promise.all([
    db.user.count({ where: { synthetic: false } }),
    db.user.count({ where: { plan: 'PREMIUM', synthetic: false } }),
    db.user.count({ where: { createdAt: { gte: month }, synthetic: false } }),
    db.aiUsage.count({ where: { createdAt: { gte: day } } }),
    db.aiUsage.groupBy({ by: ['feature'], where: { createdAt: { gte: month } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
    db.aiUsage.count({ where: { createdAt: { gte: day }, success: false } }),
    db.supportTicket.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, email: true, subject: true, body: true, status: true, createdAt: true } }),
    db.contact.count(),
    db.autopilotEvent.groupBy({ by: ['action'], where: { createdAt: { gte: day } }, _count: true }),
    db.worldConversation.count({ where: { status: 'ACTIVE' } }),
    db.worldReport.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, reason: true, createdAt: true, reporterId: true, targetId: true } }),
  ]);
  const topUsers = await db.aiUsage.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: day } },
    _count: true,
    orderBy: { _count: { userId: 'desc' } },
    take: 10,
  });
  const emails = await db.user.findMany({ where: { id: { in: topUsers.map((t) => t.userId) } }, select: { id: true, email: true, plan: true } });
  return json({
    users,
    premium,
    newUsers30d: newUsers,
    contacts,
    ai24h,
    aiFailures24h: aiFailures,
    aiByFeature30d: aiByFeature.map((f) => ({ feature: f.feature, count: f._count, inputTokens: f._sum.inputTokens ?? 0, outputTokens: f._sum.outputTokens ?? 0 })),
    autopilot24h: autopilot24h.map((a) => ({ action: a.action, count: a._count })),
    topUsers24h: topUsers.map((t) => ({ ...emails.find((e) => e.id === t.userId), requests: t._count })),
    tickets,
    worldActive,
    worldReports,
  });
});

export const PATCH = route(async (req) => {
  await requireAdmin(req);
  const { id, status } = (await req.json()) as { id: string; status: string };
  await db.supportTicket.update({ where: { id }, data: { status: status === 'closed' ? 'closed' : 'open' } });
  return json({ ok: true });
});
