import { requireUser } from '@/lib/auth';
import { aiConfig } from '@/lib/ai/provider';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { PLAN_LIMITS } from '@/lib/plans';
import { getAutopilotSettings } from '@/lib/services/autopilot';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const since = new Date(Date.now() - 86400_000);
  const [usedToday, ap, lang] = await Promise.all([
    db.aiUsage.count({ where: { userId: user.id, createdAt: { gte: since } } }),
    getAutopilotSettings(user.id),
    db.languageSettings.findUnique({ where: { userId: user.id } }),
  ]);
  const cfg = aiConfig();
  return json({
    user,
    limits: PLAN_LIMITS[user.plan],
    usage: { aiRequests24h: usedToday },
    ai: {
      provider: cfg.provider,
      mock: false,
      configured: !cfg.isMock && !!cfg.apiKey && (cfg.provider === 'anthropic' || cfg.provider === 'openai-compatible'),
    },
    autopilot: { enabled: ap.enabled, emergencyStop: ap.emergencyStop },
    language: { myLanguage: lang?.myLanguage ?? 'en' },
  });
});
