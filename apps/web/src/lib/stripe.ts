import { createHmac } from 'node:crypto';
import { safeEqual } from './crypto';
import { HttpError } from './http';

/**
 * Minimal Stripe REST client (no SDK). Billing stays disabled until
 * STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PREMIUM_PRICE_ID are set.
 */
export function stripeEnabled() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PREMIUM_PRICE_ID);
}

function flatten(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = Record<string, any>>(path: string, params: Record<string, unknown> = {}, method = 'POST'): Promise<T> {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(501, 'Billing is not activated on this server.', 'billing_disabled');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : flatten(params),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, `Stripe error: ${data?.error?.message ?? res.status}`);
  return data as T;
}

/** Verifies the Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const ts = Number(parts.t);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => safeEqual(p.slice(3), expected));
}
