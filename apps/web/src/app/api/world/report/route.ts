import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, parseBody, route, HttpError } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { attachedLineSchema, createReport, MAX_ATTACHED_LINES, REPORT_REASONS } from '@/lib/services/reports';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`world-report:${user.id}`, 10, 86400_000);
  const b = await parseBody(req, z.object({
    userId: z.string().min(1),
    conversationId: z.string().optional(),
    reason: z.enum(REPORT_REASONS),
    detail: z.string().trim().max(1000).default(''),
    /** Lines the reporter picked from their own screen. The server never had the chat. */
    lines: z.array(attachedLineSchema).max(MAX_ATTACHED_LINES).optional(),
  }));
  if (b.userId === user.id) throw new HttpError(400, 'You cannot report yourself.');
  const report = await createReport({
    reporterId: user.id,
    targetId: b.userId,
    conversationId: b.conversationId,
    reason: b.reason,
    detail: b.detail,
    lines: b.lines,
  });
  return json({ ok: true, urgent: report.urgent, attached: report.attached }, 201);
});
