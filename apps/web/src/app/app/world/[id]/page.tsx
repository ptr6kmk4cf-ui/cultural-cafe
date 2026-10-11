'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isRtl } from '@conversa/shared';
import { Alert, Badge, PageHeader, Spinner, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/client';
import { useWorldPeer } from '@/lib/world-peer';

type Msg = { id: string; mine: boolean; text: string; language: string; translation: string | null; translationLang: string | null; flagged: boolean; createdAt: string };
type Conv = {
  id: string;
  status: string;
  endsAt: string;
  remainingMs: number;
  offerer: boolean;
  ice: { iceServers: { urls: string; username?: string; credential?: string }[]; turnConfigured: boolean };
  peer: { id: string; name: string; city: string; country: string; languageLabel: string; portraitUrl: string | null } | null;
};

export default function WorldChat() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [paywall, setPaywall] = useState<'assist' | 'autopilot' | null>(null);
  const [premium, setPremium] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [left, setLeft] = useState(0);
  const [toast, show] = useToast();
  const bottom = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>([]);
  const autoRef = useRef(false);
  const disclosed = useRef(false);
  const lastHandled = useRef('');
  const sendPeerRef = useRef<(data: unknown) => void>(() => {});

  const onRemote = useCallback((data: unknown) => {
    const m = data as Msg;
    if (!m?.id || !m.text) return;
    setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, mine: false }]));
  }, []);

  const ended = conv?.status !== 'ACTIVE' || left <= 0;
  const { status: peer, send: sendPeer } = useWorldPeer(id, conv?.offerer, conv?.ice, !!conv && !ended, onRemote);
  sendPeerRef.current = sendPeer;
  msgsRef.current = msgs;
  autoRef.current = auto;

  async function refresh() {
    const r = await api(`/api/world/conversations/${id}`);
    setConv(r.conversation);
    setLeft(r.conversation.remainingMs);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    api('/api/me').then((d) => setPremium(d.limits?.worldAssist === true)).catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setLeft((ms) => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  async function ship(raw: string) {
    const r = await api(`/api/world/conversations/${id}/prepare`, { body: { text: raw } });
    sendPeerRef.current({ ...r.message, mine: false });
    setMsgs((m) => [...m, { ...r.message, mine: true, translation: null, translationLang: null }]);
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    if (peer !== 'open') {
      setError('Waiting for a direct connection. Both of you need this page open.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await ship(body);
      setText('');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function upgrade() {
    try {
      const { url } = await api('/api/billing/checkout', { body: { returnTo: `/app/world/${id}` } });
      window.location.href = url;
    } catch (e) {
      setPaywall(null);
      setError(`${(e as Error).message} Open Subscription to upgrade when Stripe is connected.`);
      router.push('/app/subscription');
    }
  }

  async function assist(autoSend: boolean) {
    if (!premium) {
      setPaywall(autoSend ? 'autopilot' : 'assist');
      return;
    }
    if (peer !== 'open') {
      setError('Wait until the badge says Direct · P2P.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api(`/api/world/conversations/${id}/assist`, {
        body: { history: msgsRef.current.map((m) => ({ mine: m.mine, text: m.text })), auto: autoSend },
      });
      if (r.hold) {
        setAuto(false);
        show(r.holdReason || 'AI paused — your turn.', 'error');
        if (r.text) setText(r.text);
        return;
      }
      if (autoSend && !disclosed.current) {
        disclosed.current = true;
        await ship(r.disclosure);
      }
      if (autoSend) await ship(r.text);
      else setText(r.text);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 402) setPaywall(autoSend ? 'autopilot' : 'assist');
      else setError(err.message);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!auto || peer !== 'open' || ended || busy) return;
    const last = msgs[msgs.length - 1];
    if (!last || last.mine || last.id === lastHandled.current) return;
    lastHandled.current = last.id;
    assist(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, auto, peer, ended]);

  async function startAuto() {
    if (!premium) {
      setPaywall('autopilot');
      return;
    }
    if (!confirm('Cultural Café will write and send for this hour. The other person will be told you are using AI. You can turn it off any time. Continue?')) return;
    setAuto(true);
    show('Autopilot on — they will see a disclosure on the next send.');
    if (peer === 'open' && msgs.some((m) => !m.mine)) assist(true);
  }

  async function end() {
    setAuto(false);
    await api(`/api/world/conversations/${id}/end`, { body: {} });
    show('Hour ended');
    await refresh();
  }

  async function block() {
    if (!conv?.peer || !confirm(`Block ${conv.peer.name}? They will not be able to find you in the Café.`)) return;
    await api('/api/world/block', { body: { userId: conv.peer.id } });
    router.push('/app/world');
  }

  async function report() {
    if (!conv?.peer) return;
    const reason = prompt('Reason: harassment, spam, scam, underage_concern, or other', 'other');
    if (!reason) return;
    try {
      await api('/api/world/report', { body: { userId: conv.peer.id, conversationId: id, reason, detail: '' } });
      show('Report sent. An admin sees the reason, not this chat.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!conv && !error) return <Spinner />;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  return (
    <div className="flex min-h-[70vh] flex-col space-y-4">
      <PageHeader
        title={conv?.peer ? `${conv.peer.name}` : 'Café chat'}
        subtitle={conv?.peer ? `${[conv.peer.city, conv.peer.country].filter(Boolean).join(', ') || 'Somewhere'} · they write in ${conv.peer.languageLabel}` : 'Loading…'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone={peer === 'open' ? 'green' : peer === 'failed' ? 'red' : 'amber'}>
              <span data-world-peer={peer}>
              {peer === 'open' ? 'Direct · P2P' : peer === 'failed' ? 'P2P failed' : peer === 'connecting' ? 'Connecting…' : 'Offline'}
              </span>
            </Badge>
            {auto && <Badge tone="brand">AI running this hour</Badge>}
            <Badge tone={ended ? 'amber' : 'green'}>{ended ? 'Ended' : `${mins}:${String(secs).padStart(2, '0')} left`}</Badge>
            {!ended && <button className="btn-secondary" onClick={end}>End hour</button>}
            <button className="btn-ghost text-xs" onClick={block}>Block</button>
            <button className="btn-ghost text-xs" onClick={report}>Report</button>
          </div>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {peer === 'failed' && (
        <Alert kind="warning">
          Could not open a direct link between your browsers. Both people must keep this page open. Some networks (school, office, strict mobile) block WebRTC unless a TURN server is set in WORLD_TURN_URL.
        </Alert>
      )}
      <Alert kind="info">
        This hour is a direct connection between your two browsers. Translation and optional AI writing go through Cultural Café; the words themselves do not. Free: you write. Premium: draft a reply, or pay to run the whole hour — they are told.
      </Alert>

      {paywall && (
        <div className="card space-y-3 border-brand-500/40">
          <h2 className="font-semibold text-white">{paywall === 'autopilot' ? 'Run this hour — Premium' : 'AI drafts — Premium'}</h2>
          <p className="text-sm text-ink-300">
            {paywall === 'autopilot'
              ? '€14.99/month. Cultural Café writes and sends on the peer-to-peer link. The other person sees that you are using AI. Money, stop requests and anything unclear come back to you.'
              : '€14.99/month. Cultural Café drafts a reply in your language. You read it and press send. The chat still goes browser-to-browser.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={upgrade}>Upgrade with Stripe</button>
            <a className="btn-secondary" href="/app/subscription">See plans</a>
            <button className="btn-ghost" onClick={() => setPaywall(null)}>Not now</button>
          </div>
        </div>
      )}

      <div className="card flex-1 space-y-3 overflow-y-auto" data-world-thread>
        {msgs.length === 0 && <p className="text-sm text-ink-400">Say hello when the badge says Direct · P2P. Refreshing the page clears the chat — it does not live on the server.</p>}
        {msgs.map((m) => {
          const shown = m.mine ? m.text : (m.translation || m.text);
          const other = m.mine ? null : (m.translation ? m.text : null);
          const open = showOriginal[m.id];
          return (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'ml-auto bg-brand-500/20 text-white' : 'bg-white/5 text-ink-100'}`}>
              <p dir={isRtl(m.mine ? m.language : m.translationLang || m.language) ? 'rtl' : 'auto'}>{shown}</p>
              {other && (
                <button type="button" className="mt-1 text-[11px] text-ink-400" onClick={() => setShowOriginal({ ...showOriginal, [m.id]: !open })}>
                  {open ? 'Hide original' : 'Show original'}
                </button>
              )}
              {open && other && <p className="mt-1 text-xs text-ink-300" dir="auto">{other}</p>}
              {m.flagged && <p className="mt-1 text-[11px] text-amber-200">This message asks for money or personal contact details. You do not have to answer.</p>}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {ended ? (
        <p className="text-sm text-ink-400">This hour is over. Because the chat was peer-to-peer, it is gone from our servers. <a className="text-brand-300" href="/app/world">Back to World</a></p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => assist(false)} data-world-assist>
              {premium ? 'Suggest a reply' : 'Suggest a reply · Premium'}
            </button>
            {auto ? (
              <button className="btn-secondary text-xs" onClick={() => { setAuto(false); show('Autopilot off — you are writing again.'); }}>Stop AI hour</button>
            ) : (
              <button className="btn-secondary text-xs" disabled={busy} onClick={startAuto} data-world-auto>
                {premium ? 'Run this hour' : 'Run this hour · Premium'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              className="input min-h-[3rem] flex-1"
              dir="auto"
              placeholder={auto ? 'AI is writing. You can still type and send.' : peer === 'open' ? 'Write in your language…' : 'Waiting for a direct connection…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn-primary self-end" disabled={!text.trim() || busy || peer !== 'open'} onClick={send}>{busy ? '…' : 'Send'}</button>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}
