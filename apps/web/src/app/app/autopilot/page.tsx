'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PLATFORMS } from '@conversa/shared';
import { Alert, Badge, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';

type S = { enabled: boolean; emergencyStop: boolean; dailyFirstContactLimit: number; dailyReplyLimit: number; minDelaySeconds: number; disclosureText: string };
type Ev = { id: string; action: string; platform: string; detail: string; createdAt: string; contactId: string | null };

export default function Autopilot() {
  const [d, setD] = useState<{ settings: S; eligible: boolean; today: { firstContacts: number; replies: number }; events: Ev[] } | null>(null);
  const [s, setS] = useState<S | null>(null);
  const [error, setError] = useState('');
  const [toast, show] = useToast();
  const load = () =>
    api('/api/autopilot').then((r) => {
      setD(r);
      setS(r.settings);
    });
  useEffect(() => {
    let cancelled = false;
    const pull = () =>
      api('/api/autopilot').then((r) => {
        if (cancelled) return;
        setD(r);
        setS(r.settings);
      });
    pull();
    const t = setInterval(pull, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  if (!d || !s) return <Spinner />;

  async function save(enabled = s!.enabled) {
    setError('');
    try {
      await api('/api/autopilot', {
        method: 'PUT',
        body: { enabled, dailyFirstContactLimit: s!.dailyFirstContactLimit, dailyReplyLimit: s!.dailyReplyLimit, minDelaySeconds: s!.minDelaySeconds, disclosureText: s!.disclosureText },
      });
      show(enabled ? 'Autopilot armed' : 'Saved');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function stop() {
    await api('/api/autopilot/stop', { method: 'POST' });
    show('EMERGENCY STOP — all Autopilot actions blocked', 'error');
    load();
  }

  const authorised = Object.values(PLATFORMS).filter((p) => p.capabilities.autoSend);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Autopilot"
        subtitle="Fully automated first contact and replies — only on platforms that explicitly authorise automated messaging. Today that is the local demo site only."
        actions={
          <button className="btn-danger px-6" onClick={stop}>
            ■ EMERGENCY STOP
          </button>
        }
      />
      {!d.eligible && <Alert kind="warning">Autopilot is a Premium feature. <Link className="underline" href="/app/subscription">Upgrade</Link></Alert>}
      {s.emergencyStop && <Alert kind="error">Emergency stop is active. Nothing will be sent automatically until you re-enable Autopilot.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Status</h2>
              <p className="text-sm text-ink-300">{s.enabled && !s.emergencyStop ? 'Armed — runs while the demo site tab is open with the extension.' : 'Off'}</p>
            </div>
            <button className={s.enabled && !s.emergencyStop ? 'btn-secondary' : 'btn-primary'} disabled={!d.eligible} onClick={() => save(!(s.enabled && !s.emergencyStop))}>
              {s.enabled && !s.emergencyStop ? 'Turn off' : 'Turn on'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="First contacts / day"><input className="input" type="number" min={0} max={50} value={s.dailyFirstContactLimit} onChange={(e) => setS({ ...s, dailyFirstContactLimit: +e.target.value })} /></Field>
            <Field label="Replies / day"><input className="input" type="number" min={0} max={300} value={s.dailyReplyLimit} onChange={(e) => setS({ ...s, dailyReplyLimit: +e.target.value })} /></Field>
            <Field label="Min seconds between msgs to same person"><input className="input" type="number" min={5} value={s.minDelaySeconds} onChange={(e) => setS({ ...s, minDelaySeconds: +e.target.value })} /></Field>
          </div>
          <Field label="AI disclosure (added to the first automated message to each person)" hint="Required — automated messages must be identifiable as AI-assisted.">
            <input className="input" value={s.disclosureText} onChange={(e) => setS({ ...s, disclosureText: e.target.value })} />
          </Field>
          <button className="btn-secondary" onClick={() => save()}>Save limits</button>
        </div>
        <div className="card space-y-3 text-sm">
          <h2 className="font-semibold text-white">Today</h2>
          <p>First contacts: <b className="text-white">{d.today.firstContacts}</b> / {s.dailyFirstContactLimit}</p>
          <p>Replies: <b className="text-white">{d.today.replies}</b> / {s.dailyReplyLimit}</p>
          <h3 className="pt-2 font-semibold text-white">Safeguards</h3>
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-300">
            <li>Only shortlisted matches can be contacted; never the same person twice.</li>
            <li>Stops permanently for anyone who declines or asks to stop.</li>
            <li>Hands over to you on sensitive topics, money/data requests, meeting logistics, photo requests or uncertainty.</li>
            <li>Never sends photos automatically.</li>
            <li>Daily caps, per-person cool-down, emergency stop — all enforced on the server.</li>
          </ul>
          <h3 className="pt-2 font-semibold text-white">Authorised platforms</h3>
          {authorised.map((p) => <p key={p.id} className="text-xs">{p.name} {p.demo && <Badge tone="amber">demo</Badge>}</p>)}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-white">Activity log</h2>
        {d.events.length === 0 ? (
          <p className="text-sm text-ink-400">No Autopilot activity yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-white/5">
              {d.events.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 text-xs text-ink-400">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="pr-3">
                    <Badge tone={e.action === 'escalated' ? 'amber' : e.action === 'stop' || e.action === 'blocked' ? 'red' : 'green'}>{e.action}</Badge>
                  </td>
                  <td className="text-ink-200">
                    {e.contactId ? <Link className="hover:underline" href={`/app/conversations/${e.contactId}`}>{e.detail}</Link> : e.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {toast}
    </div>
  );
}
