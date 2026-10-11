import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json } from '@/lib/http';
import { verifyStripeSignature } from '@/lib/stripe';

const ACTIVE = new Set(['active', 'trialing', 'past_due']);

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Billing not activated' }, 501);
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)) {
    return json({ error: 'Invalid signature' }, 400);
  }
  const event = JSON.parse(payload);
  const obj = event.data?.object ?? {};

  if (event.type?.startsWith('customer.subscription.')) {
    const user = await db.user.findUnique({ where: { stripeCustomerId: obj.customer } });
    if (user) {
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
      await db.subscription.upsert({
        where: { userId: user.id },
        update: { stripeSubscriptionId: obj.id, status, currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null },
        create: { userId: user.id, stripeSubscriptionId: obj.id, status, currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null },
      });
      await db.user.update({ where: { id: user.id }, data: { plan: ACTIVE.has(status) ? 'PREMIUM' : 'FREE' } });
    }
  }
  return json({ received: true });
}
