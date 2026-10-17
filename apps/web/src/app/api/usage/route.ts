import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { dailyAiLimit } from '@/lib/plans';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const since = new Date(Date.now() - 30 * 86400_000);
  const day = new Date(Date.now() - 86400_000);
  const [byFeature, last24h, tokens] = await Promise.all([
    db.aiUsage.groupBy({ by: ['feature'], where: { userId: user.id, createdAt: { gte: since } }, _count: true }),
    db.aiUsage.count({ where: { userId: user.id, createdAt: { gte: day } } }),
    db.aiUsage.aggregate({ where: { userId: user.id, createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true } }),
  ]);
  return json({
    plan: user.plan,
    limit24h: user.role === 'ADMIN' ? null : dailyAiLimit(user.plan),
    last24h,
    last30d: byFeature.map((f) => ({ feature: f.feature, count: f._count })),
    tokens30d: { input: tokens._sum.inputTokens ?? 0, output: tokens._sum.outputTokens ?? 0 },
  });
});
