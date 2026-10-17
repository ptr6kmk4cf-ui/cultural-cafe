import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: { retryAfter?: number },
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, 'Not found', 'not_found');

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === 'number' ? { status: init } : init);
}

const MAX_JSON_BYTES = 6 * 1024 * 1024; // profiles may include a few downscaled photos

export async function parseBody<T>(req: NextRequest | Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_JSON_BYTES) throw new HttpError(413, 'Request too large');
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
  return schema.parse(raw);
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with uniform error handling. */
export function route<P = Record<string, string>>(
  fn: (req: NextRequest, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, params);
    } catch (err) {
      if (err instanceof HttpError) {
        const retryAfter = err.extra?.retryAfter;
        return json(
          { error: err.message, code: err.code, ...(retryAfter ? { retryAfter } : {}) },
          { status: err.status, headers: retryAfter ? { 'retry-after': String(retryAfter) } : undefined },
        );
      }
      if (err instanceof ZodError) {
        return json({ error: 'Validation failed', issues: err.issues.slice(0, 10) }, 422);
      }
      console.error('[api] unhandled error', err);
      return json({ error: 'Internal server error' }, 500);
    }
  };
}
