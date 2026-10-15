import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRtl, languageName, type AnalyzeResponse, type MatchRecommendation, type ProfileInput, type ReplyResponse, type ThreadSnapshot } from '@conversa/shared';
import type { SiteAdapter } from '../adapters/types';
import { API_BASE, api, bg } from '../lib/messages';
import { AutopilotRunner } from './autopilot';

type Me = {
  user: { name: string; plan: string; role: string };
  ai: { mock: boolean; configured: boolean };
  autopilot: { enabled: boolean; emergencyStop: boolean };
  language?: { myLanguage: string };
};
type Status = { connected: boolean; apiBase: string; me: Me | null; error?: string | null };
type LogLine = { t: string; line: string; tone: 'ok' | 'warn' | 'err' | 'info' };

const Spin = () => <span className="spin" />;

function Alert({ tone, children }: { tone: 'err' | 'warn' | 'ok' | 'info'; children: React.ReactNode }) {
  return <div className={`alert ${tone}`}>{children}</div>;
}

export function Panel({ adapter }: { adapter: SiteAdapter }) {
  const [open, setOpen] = useState(() => sessionStorage.getItem('conversa-open') === '1');
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<'assist' | 'autopilot'>('assist');
  const [kind, setKind] = useState(adapter.pageKind());
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  const addLog = useCallback((line: string, tone: LogLine['tone'] = 'info') => {
    setLog((l) => [{ t: new Date().toLocaleTimeString(), line, tone }, ...l].slice(0, 200));
  }, []);
  const runner = useMemo(() => new AutopilotRunner(adapter, addLog, setRunning), [adapter, addLog]);

  const refresh = useCallback(() => bg<Status>({ type: 'status' }).then(setStatus), []);
  useEffect(() => {
    refresh();
    const onMsg = (m: { type: string }) => {
      if (m.type === 'conversa:status-changed') refresh();
      if (m.type === 'conversa:emergency-stop') {
        runner.stop('EMERGENCY STOP');
        refresh();
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);
    const un = adapter.observe(() => setKind(adapter.pageKind()));
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
      un();
    };
  }, [adapter, refresh, runner]);
  useEffect(() => {
    sessionStorage.setItem('conversa-open', open ? '1' : '0');
    if (!open) runner.stop('Panel closed');
  }, [open, runner]);
  useEffect(() => () => runner.stop('Panel closed'), [runner]);

  async function emergencyStop() {
    runner.stop('EMERGENCY STOP');
    await bg({ type: 'emergencyStop' });
    addLog('Emergency stop sent to server — all Autopilot actions blocked.', 'err');
    refresh();
  }

  if (!open) {
    return (
      <button className="launcher" title="Cultural Café" onClick={() => setOpen(true)}>
        C{status?.connected && <span className="dot" />}
      </button>
    );
  }

  return (
    <div className="panel" role="complementary" aria-label="Cultural Café assistant">
      <div className="head">
        <div className="logo">C</div>
        <div>
          <div className="title">Cultural Café</div>
          <div className="sub">
            {status?.connected ? `${status.me?.user.name} · ${status.me?.user.plan}` : 'Not connected'} · {kind}
          </div>
        </div>
        <button className="x" onClick={() => { runner.stop('Panel closed'); setOpen(false); }} aria-label="Close">×</button>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'assist' ? 'on' : ''}`} onClick={() => setTab('assist')}>Assistant</button>
        <button className={`tab ${tab === 'autopilot' ? 'on' : ''}`} onClick={() => setTab('autopilot')}>
          Autopilot {running && '●'}
        </button>
      </div>
      <div className="body">
        {!status ? (
          <Spin />
        ) : !status.connected ? (
          <div className="card">
            <p>Connect the extension to your Cultural Café account.</p>
            {status.error && <Alert tone="err">{status.error}</Alert>}
            <a className="btn" href={`${API_BASE}/app/extension`} target="_blank" rel="noreferrer">Open Cultural Café to connect</a>
          </div>
        ) : (
          <>
            {status.me?.ai.mock && <Alert tone="warn">Mock AI mode — suggestions are placeholders, not real AI.</Alert>}
            {tab === 'assist' ? (
              kind === 'discover' ? (
                <DiscoverView adapter={adapter} />
              ) : kind === 'profile' ? (
                <ProfileView adapter={adapter} />
              ) : kind === 'messages' ? (
                <ChatView adapter={adapter} me={status.me!} />
              ) : (
                <p className="muted">Open Discover, a profile, or Messages.</p>
              )
            ) : (
              <AutopilotView adapter={adapter} me={status.me!} runner={runner} running={running} log={log} refresh={refresh} />
            )}
          </>
        )}
      </div>
      {status?.connected && (
        <div className="stop">
          <button className="btn danger block" onClick={emergencyStop}>■ EMERGENCY STOP</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ discover

function DiscoverView({ adapter }: { adapter: SiteAdapter }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<AnalyzeResponse | null>(null);
  const profilesRef = useRef<Map<string, ProfileInput>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setError('');
    try {
      const profiles = await adapter.readProfiles();
      const r = await api<AnalyzeResponse>('/api/matches/analyze', { platform: adapter.platformId, profiles });
      const keep = new Set(r.recommendations.map((x) => x.externalId));
      // Keep only recommended profiles in memory; everything else is dropped right here.
      profilesRef.current = new Map(profiles.filter((p) => keep.has(p.externalId)).map((p) => [p.externalId, { ...p, photos: [] }]));
      const marks: Record<string, { recommended: boolean; label?: string }> = {};
      for (const p of profiles) marks[p.externalId] = { recommended: keep.has(p.externalId) };
      for (const rec of r.recommendations) marks[rec.externalId].label = `★ ${rec.score} Café pick`;
      adapter.markProfiles(marks);
      setRes(r);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="card">
        <p style={{ marginTop: 0 }}>Screen the profiles on this page against your preferences.</p>
        <button className="btn block" onClick={analyze} disabled={busy}>{busy ? <><Spin /> Analysing…</> : '◎ Find matches on this page'}</button>
        <p className="muted">Rejected profiles are discarded immediately — nothing about them is stored.</p>
      </div>
      {error && <Alert tone="err">{error}</Alert>}
      {res && (
        <Alert tone="info">
          {res.recommendations.length} recommended · {res.rejectedCount} discarded (of {res.analyzedCount})
        </Alert>
      )}
      {res?.recommendations.map((r) => (
        <MatchCard key={r.id} rec={r} onOpen={() => setSelected(selected === r.externalId ? null : r.externalId)}>
          {selected === r.externalId && profilesRef.current.get(r.externalId) && (
            <Openers adapter={adapter} profile={profilesRef.current.get(r.externalId)!} matchId={r.id} />
          )}
        </MatchCard>
      ))}
    </>
  );
}

function MatchCard({ rec, onOpen, children }: { rec: MatchRecommendation; onOpen: () => void; children?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <b style={{ color: '#fff' }}>{rec.name}{rec.age ? `, ${rec.age}` : ''}</b>
          <div className="muted">{rec.location}</div>
        </div>
        <div className="score">{rec.score}</div>
      </div>
      <ul>
        {rec.reasons.map((x) => <li key={x} style={{ color: '#bbf7d0' }}>{x}</li>)}
        {rec.cautions.map((x) => <li key={x} style={{ color: '#fde68a' }}>{x}</li>)}
      </ul>
      {rec.photoObservations.length > 0 && <p className="muted">📷 {rec.photoObservations.join(' · ')}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        {rec.status === 'CONTACTED' ? <span className="badge green">Already contacted</span> : <button className="btn sec" onClick={onOpen}>✎ Write opener</button>}
      </div>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ openers

function Openers({ adapter, profile, matchId }: { adapter: SiteAdapter; profile: ProfileInput; matchId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<{ text: string; hook: string; translation?: string | null }[]>([]);
  const [meta, setMeta] = useState<{ language: string; alreadyContacted: boolean; doNotContact: boolean } | null>(null);
  const [inserted, setInserted] = useState(false);

  const gen = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/profiles/openers', { platform: adapter.platformId, profile: { ...profile, photos: [] }, avoid: drafts.map((d) => d.text) });
      setDrafts(r.openers);
      setMeta({ language: r.language, alreadyContacted: r.alreadyContacted, doNotContact: r.doNotContact });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, profile]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError('');
    api('/api/profiles/openers', { platform: adapter.platformId, profile: { ...profile, photos: [] }, avoid: [] })
      .then((r) => {
        if (!live) return;
        setDrafts(r.openers);
        setMeta({ language: r.language, alreadyContacted: r.alreadyContacted, doNotContact: r.doNotContact });
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [adapter, profile]);

  useEffect(() => {
    if (!inserted || !matchId) return;
    return adapter.onUserSend(() => {
      api(`/api/matches/${matchId}/contact`, {}).catch(() => {});
    });
  }, [inserted, matchId, adapter]);

  return (
    <div style={{ marginTop: 10 }}>
      {error && <Alert tone="err">{error}</Alert>}
      {meta?.doNotContact && <Alert tone="err">This person asked not to be contacted.</Alert>}
      {meta?.alreadyContacted && <Alert tone="warn">You have already messaged this person — avoid duplicate first contact.</Alert>}
      {busy && <p className="muted"><Spin /> Writing openers…</p>}
      {meta && <p className="muted">Language: {languageName(meta.language)}</p>}
      {drafts.map((d, i) => (
        <div key={i} className="card" style={{ marginTop: 6, background: '#120f19' }}>
          <p className="muted" style={{ margin: '0 0 4px' }}>Uses: {d.hook}</p>
          <textarea rows={3} dir={meta && isRtl(meta.language) ? 'rtl' : 'auto'} value={d.text} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          {d.translation && <p className="muted" dir="auto" style={{ margin: '4px 0 0' }}>↳ {d.translation}</p>}
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="btn"
              disabled={meta?.doNotContact}
              onClick={() => {
                adapter.openComposer(profile.externalId);
                setTimeout(() => {
                  if (adapter.insertText(d.text)) setInserted(true);
                  else setError('Message box not found on this page.');
                }, 150);
              }}
            >
              ↧ Insert
            </button>
          </div>
        </div>
      ))}
      {inserted && <Alert tone="ok">Inserted. Review it and press <b>Send</b> on the site.</Alert>}
      {drafts.length > 0 && <button className="btn sec" style={{ marginTop: 6 }} onClick={gen} disabled={busy}>↻ Regenerate</button>}
    </div>
  );
}

function ProfileView({ adapter }: { adapter: SiteAdapter }) {
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    adapter.readProfile().then(setProfile);
  }, [adapter]);
  if (!profile) return <Spin />;
  return (
    <div className="card">
      <b style={{ color: '#fff' }}>{profile.name}{profile.age ? `, ${profile.age}` : ''}</b>
      <p className="muted">{profile.interests?.join(' · ')}</p>
      {!show ? <button className="btn block" onClick={() => setShow(true)}>✎ Write 3 personalised openers</button> : <Openers adapter={adapter} profile={profile} />}
    </div>
  );
}

// ------------------------------------------------------------------ chat

type ReplyResult = ReplyResponse & { needsUserInput: string | null; contact: { id: string; doNotContact: boolean; name: string } };

function ChatView({ adapter, me }: { adapter: SiteAdapter; me: Me }) {
  const [snap, setSnap] = useState<ThreadSnapshot | null>(adapter.readThread());
  const [contact, setContact] = useState<{ id: string; name: string; doNotContact: boolean; humanTakeover: boolean } | null>(null);
  const [reply, setReply] = useState<ReplyResult | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const attachedPhoto = useRef<string | null>(null);
  const threadId = snap?.externalId;
  const msgCount = snap?.messages.length ?? 0;

  useEffect(() => adapter.observe(() => setSnap(adapter.readThread())), [adapter]);

  // When the thread changes: reset, and sync history if this conversation is tracked (no AI call).
  useEffect(() => {
    let live = true;
    setReply(null);
    setDrafts([]);
    setPhoto(null);
    setInfo('');
    const s = adapter.readThread();
    if (!s) return () => {
      live = false;
    };
    api('/api/threads/lookup', { snapshot: s, track: false })
      .then((r) => {
        if (live) setContact(r.contact);
      })
      .catch(() => {
        if (live) setContact(null);
      });
    return () => {
      live = false;
    };
  }, [threadId, adapter]);

  useEffect(() => {
    if (!contact || !snap) return;
    const t = setTimeout(() => api('/api/threads/lookup', { snapshot: snap, track: false }).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [msgCount, contact, snap]);

  useEffect(
    () =>
      adapter.onUserSend(() => {
        const pid = attachedPhoto.current;
        attachedPhoto.current = null;
        if (pid && contact) api(`/api/photos/${pid}/shared`, { contactId: contact.id }).catch(() => {});
        setInfo('');
      }),
    [adapter, contact],
  );

  if (!snap) return <p className="muted">Select a conversation.</p>;
  const last = snap.messages.at(-1);

  async function suggest() {
    setBusy(true);
    setError('');
    try {
      const r = await api<ReplyResult>('/api/threads/reply', { snapshot: adapter.readThread(), instruction: instruction || undefined });
      setReply(r);
      setDrafts(r.suggestions.map((s) => s.text));
      setContact({ ...r.contact, humanTakeover: false });
      if (r.photoSuggestion) {
        const p = await bg<{ ok: boolean; data: { dataUrl: string } }>({ type: 'photo', id: r.photoSuggestion.photoId });
        setPhoto(p.ok ? p.data.dataUrl : null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  function insert(text: string) {
    if (adapter.insertText(text)) setInfo('Inserted — review and press Send on the site.');
    else setError('Message box not found.');
  }

  async function attach() {
    if (!photo || !reply?.photoSuggestion) return;
    const blob = await (await fetch(photo)).blob();
    const ext = blob.type.split('/')[1] ?? 'jpg';
    if (adapter.attachPhoto(new File([blob], `photo.${ext}`, { type: blob.type }))) {
      attachedPhoto.current = reply.photoSuggestion.photoId;
      insert(reply.photoSuggestion.caption);
      setInfo('Photo attached with caption — check the preview, then press Send yourself.');
    }
  }

  const rtl = reply ? isRtl(reply.replyLanguage) : false;
  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ color: '#fff' }}>{snap.contactName}</b>
          {contact ? <span className="badge green">tracked</span> : <span className="badge">not tracked</span>}
        </div>
        {contact?.doNotContact && <Alert tone="err">{snap.contactName} declined or asked to stop. Please respect that.</Alert>}
        <p className="muted" style={{ marginBottom: 6 }}>
          Last message from {last?.direction === 'IN' ? snap.contactName : 'you'}: “{last?.text.slice(0, 80)}”
        </p>
        <input placeholder="Optional instruction (e.g. suggest coffee Saturday)" value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !busy && suggest()} />
        <button className="btn block" style={{ marginTop: 8 }} onClick={suggest} disabled={busy}>
          {busy ? <><Spin /> Thinking…</> : '✦ Suggest replies'}
        </button>
        {!contact && <p className="muted">Using the assistant starts tracking this conversation (history + memory) in your Cultural Café account.</p>}
      </div>
      {error && <Alert tone="err">{error}</Alert>}
      {reply && (
        <div className="card">
          <div className="row">
            <span className="badge brand">{languageName(reply.detectedLanguage)} → {languageName(reply.replyLanguage)}</span>
            <span className="badge">interest: {reply.intent.interestLevel}</span>
            {reply.intent.meetingAppropriate && <span className="badge green">good time to suggest meeting</span>}
            {reply.intent.stopRequested && <span className="badge red">asked to stop</span>}
            {reply.memoryAdded > 0 && <span className="badge">+{reply.memoryAdded} memory</span>}
          </div>
          {reply.incomingTranslation && (
            <p style={{ background: '#0f0d15', padding: 8, borderRadius: 10 }} dir="auto">
              <span className="muted">Translation ({languageName(me.language?.myLanguage)}): </span>
              {reply.incomingTranslation}
            </p>
          )}
          {reply.intent.needsHuman && <Alert tone="warn">⚑ {reply.intent.needsHumanReason || 'This needs your judgement.'}</Alert>}
          {reply.needsUserInput && <Alert tone="info">{reply.needsUserInput}</Alert>}
          {drafts.map((d, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <textarea rows={3} dir={rtl ? 'rtl' : 'auto'} value={d} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))} />
              {reply.suggestions[i]?.translation && <p className="muted" dir="auto">↳ {reply.suggestions[i].translation}</p>}
              <button className="btn" onClick={() => insert(d)} disabled={contact?.doNotContact && !reply.intent.stopRequested}>↧ Insert</button>
            </div>
          ))}
          {reply.photoSuggestion && (
            <div className="card" style={{ marginTop: 10, background: '#120f19' }}>
              <p className="muted" style={{ marginTop: 0 }}>Suggested photo · {reply.photoSuggestion.reason}</p>
              <div className="row">
                {photo && <img className="thumb" src={photo} alt="suggested" />}
                <div style={{ flex: 1 }}>
                  <p dir="auto" style={{ margin: 0 }}>{reply.photoSuggestion.caption}</p>
                  <button className="btn sec" style={{ marginTop: 6 }} onClick={attach} disabled={!photo}>📎 Attach (you press Send)</button>
                </div>
              </div>
            </div>
          )}
          <button className="btn sec" style={{ marginTop: 8 }} onClick={suggest} disabled={busy}>↻ Regenerate</button>
        </div>
      )}
      {info && <Alert tone="ok">{info}</Alert>}
    </>
  );
}

// ------------------------------------------------------------------ autopilot

function AutopilotView({
  adapter,
  me,
  runner,
  running,
  log,
  refresh,
}: {
  adapter: SiteAdapter;
  me: Me;
  runner: AutopilotRunner;
  running: boolean;
  log: LogLine[];
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kind = adapter.pageKind();
  const ap = me.autopilot;
  const armed = ap.enabled && !ap.emergencyStop;

  useEffect(() => {
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function firstContacts() {
    setBusy(true);
    setError('');
    try {
      const profiles = await adapter.readProfiles();
      const r = await api<AnalyzeResponse>('/api/matches/analyze', { platform: adapter.platformId, profiles });
      const recs = r.recommendations.filter((x) => x.status === 'SHORTLISTED');
      setBusy(false);
      await runner.runFirstContacts(profiles.filter((p) => recs.some((x) => x.externalId === p.externalId)), recs);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ color: '#fff' }}>Autopilot</b>
          {ap.emergencyStop ? <span className="badge red">emergency stop</span> : ap.enabled ? <span className="badge green">armed</span> : <span className="badge">off</span>}
        </div>
        <p className="muted">
          Authorised on this site for local testing only. The server checks every message against your limits, consent signals and escalation rules. Photos are never sent automatically.
        </p>
        {!armed && (
          <Alert tone="info">
            Turn Autopilot on in your dashboard first. <a style={{ color: '#fff' }} href={`${API_BASE}/app/autopilot`} target="_blank" rel="noreferrer">Open settings</a>
          </Alert>
        )}
        {error && <Alert tone="err">{error}</Alert>}
        {running ? (
          <button className="btn danger block" onClick={() => runner.stop('Stopped by you')}>■ Stop run</button>
        ) : kind === 'messages' ? (
          <button className="btn block" disabled={!armed} onClick={() => runner.runReplies()}>▶ Start auto-reply on this tab</button>
        ) : kind === 'discover' ? (
          <button className="btn block" disabled={!armed || busy} onClick={firstContacts}>{busy ? <><Spin /> Screening…</> : '▶ Screen & message top matches'}</button>
        ) : (
          <p className="muted">Open Discover (first contacts) or Messages (replies).</p>
        )}
      </div>
      <div className="card">
        <b style={{ color: '#fff' }}>Activity</b>
        <div className="log" style={{ marginTop: 6 }}>
          {log.length === 0 ? <span className="muted">Nothing yet.</span> : log.map((l, i) => (
            <div key={i} style={{ color: l.tone === 'ok' ? '#bbf7d0' : l.tone === 'warn' ? '#fde68a' : l.tone === 'err' ? '#fecaca' : '#cbd5e1' }}>
              [{l.t}] {l.line}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
