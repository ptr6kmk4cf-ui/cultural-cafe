import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { ensurePracticeTable } from '@/lib/services/cafe-board';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  return json(await ensurePracticeTable(user));
});
