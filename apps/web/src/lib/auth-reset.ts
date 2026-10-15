import { PRODUCTION_ORIGIN, hashPassword } from './auth';
import { randomToken, sha256 } from './crypto';
import { db } from './db';
import { HttpError } from './http';
import { sendCafeEmail } from './mail';

const RESET_MS = 60 * 60 * 1000;

export function resetPath(token: string) {
  return `/reset?token=${encodeURIComponent(token)}`;
}

function cafeOrigin() {
  return new URL(process.env.APP_URL || (process.env.NODE_ENV === 'production' ? PRODUCTION_ORIGIN : 'http://localhost:3000')).origin;
}

export function resetMail(opts: { name: string; url: string }) {
  return {
    subject: 'Choose a new Cultural Café password',
    text: `Hi ${opts.name},\n\nUse this link to choose a new password for Cultural Café:\n\n${opts.url}\n\nIt expires in one hour. If you did not ask for this, you can ignore this email.\n`,
  };
}

/** Creates a one-hour reset if that email has a real account. Always looks the same from outside. */
export async function issuePasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.synthetic) return { token: '' };
  await db.passwordReset.deleteMany({ where: { userId: user.id } });
  const token = randomToken();
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_MS),
    },
  });
  return { token, name: user.name, email: user.email };
}

export async function sendPasswordReset(email: string) {
  const issued = await issuePasswordReset(email);
  if (issued.token) {
    const mail = resetMail({ name: issued.name || 'there', url: `${cafeOrigin()}${resetPath(issued.token)}` });
    await sendCafeEmail({ to: issued.email || email, ...mail });
  }
  const local = process.env.NODE_ENV !== 'production' && issued.token ? resetPath(issued.token) : '';
  return { ok: true as const, devLink: local };
}

export async function applyPasswordReset(token: string, password: string) {
  const row = await db.passwordReset.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, synthetic: true } } },
  });
  if (!row || row.expiresAt < new Date() || row.user.synthetic) {
    throw new HttpError(400, 'This link has expired. Ask for a new one.', 'reset_expired');
  }
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    db.passwordReset.deleteMany({ where: { userId: row.userId } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
  ]);
}
