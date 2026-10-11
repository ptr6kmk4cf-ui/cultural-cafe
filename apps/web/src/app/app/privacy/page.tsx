'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, Field, PageHeader, useToast } from '@/components/ui';
import { api } from '@/lib/client';

export default function PrivacyAccount() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [pw, setPw] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState({ subject: '', body: '' });
  const [toast, show] = useToast();

  const load = () => api('/api/account/sessions').then((d) => setSessions(d.sessions));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Privacy & account" subtitle="Your data, your call. Export or delete anything at any time." />
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold text-white">Your data</h2>
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink-300">
            <li>Messages, memories and notes are encrypted at rest.</li>
            <li>Rejected profiles are never stored; dismissed matches are deleted.</li>
            <li>The extension only runs on supported sites — no browsing history is collected.</li>
            <li>Photos are private, metadata-stripped, and only you can access them.</li>
          </ul>
          <a className="btn-secondary" href="/api/account/export">Download all my data (JSON)</a>
          <button
            className="btn-ghost"
            onClick={async () => {
              await api('/api/matches', { method: 'DELETE' });
              show('Shortlist cleared');
            }}
          >
            Clear my match shortlist
          </button>
          <Link href="/legal/privacy" className="text-xs text-brand-300">Read the privacy policy →</Link>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-white">Signed-in devices & extension</h2>
          <ul className="divide-y divide-white/5 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>
                  <Badge>{s.kind}</Badge> {s.label ?? 'Browser session'}
                </span>
                <span className="text-xs text-ink-400">last used {new Date(s.lastUsedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <button
            className="btn-secondary"
            onClick={async () => {
              await api('/api/account/sessions', { method: 'DELETE' });
              window.location.href = '/login';
            }}
          >
            Sign out everywhere (incl. extension)
          </button>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-white">Contact support</h2>
          <input className="input" placeholder="Subject" value={ticket.subject} onChange={(e) => setTicket({ ...ticket, subject: e.target.value })} />
          <textarea className="input min-h-24" placeholder="How can we help?" value={ticket.body} onChange={(e) => setTicket({ ...ticket, body: e.target.value })} />
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                await api('/api/support', { body: ticket });
                setTicket({ subject: '', body: '' });
                show('Message sent to support');
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Send
          </button>
        </div>

        <div className="card space-y-3 border-red-500/30">
          <h2 className="font-semibold text-red-200">Delete account</h2>
          <p className="text-sm text-ink-300">Permanently deletes your account, contacts, conversations, memories, photos and settings. This cannot be undone.</p>
          <Field label="Password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label='Type "DELETE" to confirm'><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
          <button
            className="btn-danger"
            disabled={confirmText !== 'DELETE' || !pw}
            onClick={async () => {
              try {
                await api('/api/account', { method: 'DELETE', body: { password: pw, confirm: 'DELETE' } });
                window.location.href = '/';
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Delete my account forever
          </button>
        </div>
      </div>
      {toast}
    </div>
  );
}
