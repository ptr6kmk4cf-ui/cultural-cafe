import type { ApiResult, BgRequest } from './lib/messages';
import { API_BASE } from './lib/messages';

/**
 * Background service worker. It is the ONLY place that holds the user's
 * Conversa token and talks to the backend. AI provider keys never exist in the
 * extension — all AI calls happen server-side.
 */

const TOKEN_KEY = 'conversaToken';

async function getToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(TOKEN_KEY);
  return (r[TOKEN_KEY] as string) ?? null;
}

async function callApi(path: string, method = 'GET', body?: unknown): Promise<ApiResult> {
  // Only our own API, never arbitrary URLs; token minting stays web-only.
  if (!path.startsWith('/api/') || path.startsWith('/api/extension/token') || path.includes('..')) {
    return { ok: false, status: 400, error: 'Blocked path' };
  }
  const token = await getToken();
  if (!token) return { ok: false, status: 401, error: 'Not connected — open Cultural Café → Browser Extension to connect.', code: 'not_connected' };
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) await chrome.storage.local.remove(TOKEN_KEY);
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? `HTTP ${res.status}`, code: data.code };
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: `Cannot reach Cultural Café at ${API_BASE}: ${(e as Error).message}` };
  }
}

async function photoDataUrl(id: string): Promise<ApiResult<{ dataUrl: string; mimeType: string }>> {
  const token = await getToken();
  if (!token || !/^[\w-]{5,40}$/.test(id)) return { ok: false, status: 400, error: 'Bad request' };
  const res = await fetch(`${API_BASE}/api/photos/${id}/file`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return { ok: false, status: res.status, error: 'Photo not available' };
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { ok: true, status: 200, data: { dataUrl: `data:${mimeType};base64,${btoa(bin)}`, mimeType } };
}

async function broadcast(msg: unknown) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) if (t.id) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg: BgRequest, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'api':
        return callApi(msg.path, msg.method ?? (msg.body !== undefined ? 'POST' : 'GET'), msg.body);
      case 'photo':
        return photoDataUrl(msg.id);
      case 'connect': {
        // Only accepted from the bridge script running on the Conversa web app itself.
        if (!sender.url || new URL(sender.url).origin !== new URL(API_BASE).origin) return { ok: false, error: 'Untrusted origin' };
        if (typeof msg.token !== 'string' || msg.token.length < 20) return { ok: false, error: 'Bad token' };
        await chrome.storage.local.set({ [TOKEN_KEY]: msg.token });
        broadcast({ type: 'conversa:status-changed' });
        return { ok: true };
      }
      case 'disconnect':
        await chrome.storage.local.remove(TOKEN_KEY);
        broadcast({ type: 'conversa:status-changed' });
        return { ok: true };
      case 'status': {
        const token = await getToken();
        if (!token) return { connected: false, apiBase: API_BASE };
        const me = await callApi('/api/me');
        return { connected: me.ok, apiBase: API_BASE, me: me.ok ? me.data : null, error: me.ok ? null : me.error };
      }
      case 'emergencyStop': {
        await chrome.storage.session.set({ conversaLocalStop: Date.now() });
        broadcast({ type: 'conversa:emergency-stop' });
        return callApi('/api/autopilot/stop', 'POST', {});
      }
    }
  })().then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.tabs.create({ url: `${API_BASE}/app/extension` });
});
