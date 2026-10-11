'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';

/**
 * Hands a fresh, revocable extension token to the Conversa extension through a
 * window.postMessage bridge (the extension's bridge script only runs on this page).
 */
export default function ExtensionPage() {
  const [detected, setDetected] = useState(false);
  const [connected, setConnected] = useState(false);
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = () => api('/api/extension/token').then((d) => setSessions(d.sessions));
  useEffect(() => {
    load();
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data?.type === 'CONVERSA_EXTENSION_READY') setDetected(true);
      if (e.data?.type === 'CONVERSA_CONNECTED') {
        setConnected(true);
        load();
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ type: 'CONVERSA_PING' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  async function connect() {
    setError('');
    try {
      const { token } = await api('/api/extension/token', { body: { label: `Chrome extension (${new Date().toLocaleDateString()})` } });
      window.postMessage({ type: 'CONVERSA_CONNECT', token, apiBase: window.location.origin }, window.location.origin);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function manual() {
    const { token } = await api('/api/extension/token', { body: { label: 'Chrome extension (manual)' } });
    setManualToken(token);
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Browser extension" subtitle="The Cultural Café panel appears next to supported dating sites. It never reads other websites." />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold text-white">1 · Install</h2>
          <ol className="list-decimal space-y-1 pl-4 text-sm text-ink-300">
            <li>Run <code className="rounded bg-white/10 px-1">npm run build:ext</code>.</li>
            <li>Open <code className="rounded bg-white/10 px-1">chrome://extensions</code> and enable Developer mode.</li>
            <li>Click “Load unpacked” and select <code className="rounded bg-white/10 px-1">apps/extension/dist</code>.</li>
            <li>Reload this page.</li>
          </ol>
          <p className="text-sm">Extension: {detected ? <Badge tone="green">detected</Badge> : <Badge>not detected</Badge>}</p>
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold text-white">2 · Connect</h2>
          {connected ? (
            <Alert kind="success">Extension connected. Open the demo dating site at <a className="underline" href="http://localhost:4000" target="_blank" rel="noreferrer">localhost:4000</a>.</Alert>
          ) : (
            <button className="btn-primary" disabled={!detected} onClick={connect}>Connect extension to my account</button>
          )}
          <details className="text-sm text-ink-300">
            <summary className="cursor-pointer">Connect manually instead</summary>
            <p className="mt-2">Generate a token and paste it in the extension&apos;s options page. It is shown only once.</p>
            <button className="btn-secondary mt-2" onClick={manual}>Generate token</button>
            {manualToken && <code className="mt-2 block break-all rounded bg-black/40 p-2 text-xs">{manualToken}</code>}
          </details>
        </div>
      </div>
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-white">Connected extensions</h2>
          {sessions.length > 0 && (
            <button className="btn-ghost text-xs text-red-300" onClick={async () => { await api('/api/extension/token', { method: 'DELETE' }); load(); }}>Revoke all</button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-400">None yet.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>{s.label}</span>
                <span className="flex items-center gap-3 text-xs text-ink-400">
                  last used {new Date(s.lastUsedAt).toLocaleString()}
                  <button className="text-red-300" onClick={async () => { await api(`/api/extension/token?id=${s.id}`, { method: 'DELETE' }); load(); }}>revoke</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
