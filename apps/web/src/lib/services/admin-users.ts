import { db } from '../db';

/** Real sign-ups only. Café guests are synthetic and never registered. */
export function registeredUserWhere() {
  return { synthetic: false as const };
}

/** Public admin row. The password hash is never included. */
export function toRegisteredAccount(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    registeredAt: user.createdAt.toISOString(),
    signIn: 'Email and password' as const,
  };
}

/** Everyone who created an account with email and password, including older sign-ups. */
export async function listRegisteredAccounts() {
  const rows = await db.user.findMany({
    where: registeredUserWhere(),
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, plan: true, createdAt: true },
  });
  return rows.map(toRegisteredAccount);
}
