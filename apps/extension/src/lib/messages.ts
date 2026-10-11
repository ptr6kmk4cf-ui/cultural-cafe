export type BgRequest =
  | { type: 'api'; path: string; method?: string; body?: unknown }
  | { type: 'photo'; id: string }
  | { type: 'connect'; token: string }
  | { type: 'disconnect' }
  | { type: 'status' }
  | { type: 'emergencyStop' };

export type ApiResult<T = any> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; code?: string };

export async function bg<T = any>(msg: BgRequest): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

/** Calls the Conversa backend through the background worker (token never leaves it). */
export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await bg<ApiResult<T>>({ type: 'api', path, body, method });
  if (!res) throw new Error('Extension background not reachable');
  if (!res.ok) throw Object.assign(new Error(res.error), { status: res.status, code: res.code });
  return res.data;
}

declare const __API_BASE__: string;
export const API_BASE: string = typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : 'http://localhost:3000';
