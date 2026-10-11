import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, route } from '@/lib/http';
import { stripe, stripeEnabled } from '@/lib/stripe';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  if (!stripeEnabled()) throw new HttpError(501, 'Billing is not activated yet.', 'billing_disabled');
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!full.stripeCustomerId) throw new HttpError(404, 'No billing account yet.');
  const s = await stripe('billing_portal/sessions', {
    customer: full.stripeCustomerId,
    return_url: `${process.env.APP_URL || 'http://localhost:3000'}/app/subscription`,
  });
  return json({ url: s.url });
});
