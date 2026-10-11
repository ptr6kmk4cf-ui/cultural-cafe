import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { expireStale, listPeople, touchPresence } from '@/lib/services/world';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  await expireStale();
  await touchPresence(user.id);
  return json({ people: await listPeople(user.id) });
});
