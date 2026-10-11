import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { json, parseBody, route, HttpError } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

const REASONS = ['harassment', 'spam', 'scam', 'underage_concern', 'other'] as const;

export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`world-report:${user.id}`, 10, 86400_000);
  const b = await parseBody(req, z.object({
    userId: z.string().min(1),
    conversationId: z.string().optional(),
    reason: z.enum(REASONS),
    detail: z.string().trim().max(1000).default(''),
  }));
  if (b.userId === user.id) throw new HttpError(400, 'You cannot report yourself.');
  await db.worldReport.create({
    data: {
      reporterId: user.id,
      targetId: b.userId,
      conversationId: b.conversationId,
      reason: b.reason,
      detail: encrypt(b.detail),
    },
  });
  return json({ ok: true }, 201);
});
