import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, json, parseBody, route } from '@/lib/http';
import { stripe, stripeEnabled } from '@/lib/stripe';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  if (!stripeEnabled()) throw new HttpError(501, 'Billing is not activated yet. Set the STRIPE_* variables to enable it.', 'billing_disabled');
  let returnTo: string | undefined;
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 2 && req.headers.get('content-type')?.includes('application/json')) {
    returnTo = (await parseBody(req, z.object({ returnTo: z.string().regex(/^\/app(?:\/[\w-]+)*$/).optional() }))).returnTo;
  }
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  let customer = full.stripeCustomerId;
  if (!customer) {
    const c = await stripe('customers', { email: full.email, name: full.name, metadata: { userId: full.id } });
    customer = c.id as string;
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer } });
  }
  const app = process.env.APP_URL || 'http://localhost:3000';
  const dest = returnTo || '/app/subscription';
  const session = await stripe('checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: { 0: { price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 } },
    success_url: `${app}${dest}?status=success`,
    cancel_url: `${app}${dest}?status=cancelled`,
    allow_promotion_codes: true,
  });
  return json({ url: session.url });
});
