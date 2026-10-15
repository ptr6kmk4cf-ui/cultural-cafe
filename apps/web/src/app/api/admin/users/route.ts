import { requireAdmin } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { listRegisteredAccounts } from '@/lib/services/admin-users';

/** Registered café accounts. Passwords are hashed and are not returned. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ users: await listRegisteredAccounts() });
});
