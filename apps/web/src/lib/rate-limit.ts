import { db } from './db';
import { sha256 } from './crypto';
import { HttpError } from './http';

/**
 * Fixed-window rate limiter stored in Postgres.
 *
 * Every check is one atomic upsert on a shared row, so the limit holds across
 * Vercel instances, cold starts and redeploys. The database clock decides when a
 * window ends, so instances with drifting clocks still agree.
 *
 * If the database cannot be reached the request is allowed and the error is logged:
 * a limiter outage should not take the whole site down with it.
 */

const CLEANUP_EVERY = 200;
let callsSinceCleanup = 0;

type Bucket = { count: number; resetAt: Date };

/** Bumps the counter for `key` and returns its state after this request. */
export async function hitRateLimit(key: string, windowMs: number): Promise<Bucket> {
  const hashed = sha256(`rl:${key}`);
  const ms = Math.max(1, Math.round(windowMs));
  const rows = await db.$queryRaw<Bucket[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${hashed}, 1, now() + ${ms} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", "resetAt"`;
  if (++callsSinceCleanup >= CLEANUP_EVERY) {
    callsSinceCleanup = 0;
    void db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 hour'`.catch(() => undefined);
  }
  return rows[0];
}

export async function rateLimit(key: string, limit: number, windowMs: number) {
  let bucket: Bucket;
  try {
    bucket = await hitRateLimit(key, windowMs);
  } catch (e) {
    console.error('[rate-limit] store unavailable, allowing request', (e as Error).message);
    return;
  }
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.getTime() - Date.now()) / 1000));
    throw new HttpError(429, 'Too many requests, please slow down', 'rate_limited', { retryAfter });
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
