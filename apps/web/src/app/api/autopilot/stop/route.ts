import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, route } from '@/lib/http';
import { logAutopilot } from '@/lib/services/autopilot';

/** EMERGENCY STOP — immediately blocks every Autopilot action for this account. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await db.autopilotSettings.upsert({
    where: { userId: user.id },
    update: { emergencyStop: true, enabled: false },
    create: { userId: user.id, emergencyStop: true, enabled: false },
  });
  await logAutopilot(user.id, '*', 'stop', null, 'Emergency stop pressed');
  return json({ ok: true, stopped: true });
});
