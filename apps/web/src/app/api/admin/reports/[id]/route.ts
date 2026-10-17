import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { json, notFound, parseBody, route } from '@/lib/http';
import { setReportStatus } from '@/lib/services/reports';

/** Mark a report reviewed, or open it again. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, z.object({ status: z.enum(['open', 'reviewed']) }));
  if (!(await setReportStatus(id, b.status, admin.id))) throw notFound();
  return json({ ok: true, status: b.status });
});
