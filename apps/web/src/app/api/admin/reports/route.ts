import { requireAdmin } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { countOpenUrgentReports, listReports } from '@/lib/services/reports';

/** User reports for admins, urgent ones first. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const [reports, urgentOpen] = await Promise.all([listReports(), countOpenUrgentReports()]);
  return json({ reports, urgentOpen });
});
