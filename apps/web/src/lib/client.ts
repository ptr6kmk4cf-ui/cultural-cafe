'use client';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = data?.issues?.[0];
    const msg = issue ? `${issue.path?.join('.') || 'input'}: ${issue.message}` : data?.error || `Request failed (${res.status})`;
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth')) window.location.href = '/login';
    throw new ApiError(msg, res.status, data?.code);
  }
  return data as T;
}

export function splitTags(s: string): string[] {
  return [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))];
}
