'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isRtl } from '@conversa/shared';
import { DictationButton, HearButton, speakLine, stopSpeaking, unlockSpeech, type DictationHandle } from '@/components/CafeSpeech';
import { useUi } from '@/components/UiLocale';
import { Alert, Badge, Spinner, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/client';
import { deviceKeepsLines, forgetDeviceLines, loadDeviceLines, saveDeviceLines, setDeviceKeepsLines } from '@/lib/cafe-device';
import { spokenLine, visibleLine } from '@/lib/speech';
import { isClosingLine } from '@/lib/table-reply';
import { useWorldPeer } from '@/lib/world-peer';

type Msg = { id: string; seq?: number; mine: boolean; text: string; language: string; translation: string | null; translationLang: string | null; flagged: boolean; createdAt: string };
type Conv = {
  id: string;
  status: string;
  endsAt: string;
  remainingMs: number;
  offerer: boolean;
  ice: { iceServers: { urls: string; username?: string; credential?: string }[]; turnConfigured: boolean };
  peer: { id: string; name: string; city: string; country: string; gender?: '' | 'man' | 'woman'; languageLabel: string; portraitUrl: string | null; guest?: boolean } | null;
  prompt: { id: string; title: string; question: string } | null;
};

export default function WorldChat() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useUi();
  const router = useRouter();
  const [conv, setConv] = useState<Conv | null>(null);
  const [myLang, setMyLang] = useState(lang);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [auto, setAuto] = useState(false);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [left, setLeft] = useState(0);
  const [toast, show] = useToast();
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const dictate = useRef<DictationHandle>(null);
  const msgsRef = useRef<Msg[]>([]);
  const disclosed = useRef(false);
  const lastHandled = useRef('');
  const assistRef = useRef(false);
  const autoTries = useRef<Record<string, number>>({});
  const sendPeerRef = useRef<(data: unknown) => void>(() => {});
  const busyRef = useRef(false);
  const lastSendAt = useRef(0);
  const pendingRelease = useRef<{ id: string; timer: number } | null>(null);
  const greeted = useRef('');
  const [keyboard, setKeyboard] = useState(0);
  const [keep, setKeep] = useState(false);
  const [hear, setHear] = useState(false);
  const [micPhase, setMicPhase] = useState<'idle' | 'asking' | 'listening'>('idle');
  const knownHear = useRef(new Set<string>());
  const heardRef = useRef('');

  const onRemote = useCallback((data: unknown) => {
    const m = data as Msg;
    if (!m?.id || !m.text) return;
    const text = String(m.text).slice(0, 4000);
    const translation = m.translation ? String(m.translation).slice(0, 4000) : null;
    setMsgs((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      const next = [...prev, { ...m, text, translation, mine: false }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  const ready = conv != null;
  const ended = ready && (conv.status !== 'ACTIVE' || left <= 0);
  const guestHour = !!conv?.peer?.guest && conv.id === id;
  const { status: peer, send: sendPeer } = useWorldPeer(id, conv?.offerer, conv?.ice, !!conv && !ended && !guestHour, onRemote);
  const peerRef = useRef(peer);
  sendPeerRef.current = sendPeer;
  peerRef.current = peer;
  msgsRef.current = msgs;

  useEffect(() => {
    setKeep(deviceKeepsLines());
    const saved = loadDeviceLines(id);
    msgsRef.current = saved;
    setMsgs(saved);
    greeted.current = '';
    heardRef.current = '';
    knownHear.current = new Set(saved.map((m) => m.id));
    try {
      const on = sessionStorage.getItem(`cafe-hear:${id}`) === '1';
      setHear(on);
    } catch {
      setHear(false);
    }
  }, [id]);

  useEffect(() => {
    api('/api/me')
      .then((d) => {
        const mine = d.language?.myLanguage;
        if (mine) setMyLang(mine);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => stopSpeaking();
  }, [id]);

  useEffect(() => {
    if (keep) saveDeviceLines(id, msgs);
  }, [keep, id, msgs]);

  useEffect(() => {
    if (msgs.length > 200) setMsgs((current) => current.slice(-200));
  }, [msgs]);

  useEffect(() => {
    let cancelled = false;
    const pull = () =>
      api(`/api/world/conversations/${id}?messages=0`).then((r) => {
        if (cancelled) return;
        setConv(r.conversation);
        setLeft(r.conversation.remainingMs);
      });
    pull().catch((e) => {
      if (!cancelled) setError((e as Error).message);
    });
    const t = setInterval(() => pull().catch(() => {}), peer === 'open' ? 8000 : 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, peer]);

  useEffect(() => {
    if (!guestHour || ended || greeted.current === id) return;
    if (msgsRef.current.some((m) => !m.id.startsWith('local_'))) {
      greeted.current = id;
      return;
    }
    greeted.current = id;
    api(`/api/world/conversations/${id}/guest`, { body: { history: [] } })
      .then((r) => {
        const message = r.message as Msg;
        setMsgs((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      })
      .catch(() => {
        if (greeted.current === id) greeted.current = '';
      });
  }, [guestHour, id, ended]);

  useEffect(() => {
    if (!id || !ready || ended) return;
    const hourId = id;
    if (pendingRelease.current?.id === hourId) {
      window.clearTimeout(pendingRelease.current.timer);
      pendingRelease.current = null;
    }
    let closed = false;
    const beat = () => {
      if (closed) return;
      const phase = guestHour || peerRef.current === 'open' ? 'open' : 'connecting';
      api(`/api/world/conversations/${hourId}/link`, { body: { phase } }).catch(() => {});
    };
    const release = () => {
      if (closed) return;
      closed = true;
      fetch(`/api/world/conversations/${hourId}/link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ release: true }),
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {});
    };
    beat();
    const t = window.setInterval(beat, 20_000);
    window.addEventListener('pagehide', release);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', release);
      const timer = window.setTimeout(() => {
        if (pendingRelease.current?.timer === timer) pendingRelease.current = null;
        if (!closed) {
          release();
          forgetDeviceLines(hourId);
          fetch(`/api/world/conversations/${hourId}/end`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            credentials: 'same-origin',
            keepalive: true,
          }).catch(() => {});
        }
      }, 1500);
      pendingRelease.current = { id: hourId, timer };
    };
  }, [id, ready, ended, guestHour]);

  useEffect(() => {
    const t = setInterval(() => setLeft((ms) => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [msgs.length]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height)));
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  function toggleKeep() {
    const next = !keep;
    setDeviceKeepsLines(next);
    setKeep(next);
    if (next) saveDeviceLines(id, msgsRef.current);
  }

  async function ship(raw: string, replaceId?: string) {
    const r = await api(`/api/world/conversations/${id}/prepare`, { body: { text: raw } });
    const mine = { ...r.message, mine: true as const };
    const place = (list: Msg[]) => {
      const without = replaceId ? list.filter((x) => x.id !== replaceId && x.id !== mine.id) : list.filter((x) => x.id !== mine.id);
      return [...without, mine];
    };
    if (guestHour) {
      const prior = place(msgsRef.current)
        .filter((m) => !m.id.startsWith('local_') && m.id !== mine.id)
        .slice(-11)
        .map((m) => ({
          mine: m.mine,
          text: m.text.slice(0, 500),
          translation: (m.translation || '').slice(0, 500),
        }));
      const history = [
        ...prior,
        { mine: true as const, text: raw.slice(0, 500), translation: (mine.translation || '').slice(0, 500) },
      ];
      const reply = await api(`/api/world/conversations/${id}/guest`, { body: { history } });
      setMsgs((m) => {
        const next = place(m);
        return next.some((x) => x.id === reply.message.id) ? next : [...next, reply.message];
      });
      if (reply.closed) rememberAuto(false);
      return;
    }
    try {
      sendPeerRef.current({ ...r.message, mine: false });
    } catch {
      throw new Error('The live link is not open yet. Wait a moment, then send again.');
    }
    setMsgs((m) => place(m));
  }

  async function send() {
    const now = Date.now();
    if (now - lastSendAt.current < 400) return;
    lastSendAt.current = now;
    const body = text.trim();
    if (busyRef.current) return;
    if (!body) {
      setError('Type a few words, then tap Send.');
      return;
    }
    busyRef.current = true;
    setSending(true);
    setError('');
    dictate.current?.hangUp();
    const localId = `local_${Date.now().toString(36)}`;
    setMsgs((m) => [...m, { id: localId, mine: true, text: body, language: '', translation: null, translationLang: null, flagged: false, createdAt: new Date().toISOString() }]);
    setText('');
    try {
      await ship(body, localId);
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== localId));
      setText(body);
      setError((e as Error).message || 'Could not send. Tap Send again.');
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  }

  function showDraft(draft: string) {
    setText(draft);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.scrollIntoView({ block: 'nearest' });
    });
  }

  function modelHistory() {
    return msgsRef.current.slice(-24).map((m) => ({
      mine: m.mine,
      text: (m.mine ? m.text : m.translation || m.text).slice(0, 2000),
    }));
  }

  function markDisclosed() {
    disclosed.current = true;
    try {
      sessionStorage.setItem(`cafe-told:${id}`, '1');
    } catch {
      /* ignore */
    }
  }

  async function assist(autoSend: boolean, handledId?: string) {
    if (assistRef.current) return;
    assistRef.current = true;
    setBusy(true);
    if (!autoSend) setDrafting(true);
    setError('');
    try {
      const r = await api(`/api/world/conversations/${id}/assist`, {
        body: { history: modelHistory(), auto: autoSend },
      });
      if (!autoSend) {
        const drafted = (r.text || '').trim();
        if (!drafted) {
          setError('Claude Sonnet did not write a line. Try again.');
          return;
        }
        showDraft(drafted);
        return;
      }
      const drafted = (r.text || '').trim();
      if (drafted && msgsRef.current.some((m) => m.mine && m.text.trim() === drafted)) {
        if (handledId) lastHandled.current = handledId;
        rememberAuto(false);
        show('Answering stopped. That line was already sent.', 'error');
        return;
      }
      if (r.hold) {
        if (handledId) lastHandled.current = handledId;
        rememberAuto(false);
        show(r.holdReason || 'Paused — your turn.', 'error');
        if (r.text) showDraft(r.text);
        return;
      }
      if (!disclosed.current && r.disclosure) {
        try {
          await ship(r.disclosure);
          markDisclosed();
        } catch {
          /* The reply below still goes out. */
        }
      }
      await ship(r.text);
      if (handledId) lastHandled.current = handledId;
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) rememberAuto(false);
      setError(err.message || 'Claude Sonnet did not answer. Try again.');
      setNudge((n) => n + 1);
    } finally {
      assistRef.current = false;
      setBusy(false);
      setDrafting(false);
    }
  }

  function rememberAuto(on: boolean) {
    setAuto(on);
    try {
      sessionStorage.setItem(`cafe-auto:${id}`, on ? '1' : '0');
    } catch {
      /* Private browsing can block storage. The switch still works for this page. */
    }
  }

  function rememberHear(on: boolean) {
    setHear(on);
    try {
      sessionStorage.setItem(`cafe-hear:${id}`, on ? '1' : '0');
    } catch {
      /* Private browsing can block storage. */
    }
    if (on) {
      knownHear.current = new Set(msgsRef.current.map((m) => m.id));
      unlockSpeech();
    } else {
      stopSpeaking();
    }
  }

  useEffect(() => {
    if (!hear || ended) return;
    const last = msgs.at(-1);
    if (!last || last.mine || last.id.startsWith('local_') || last.id === heardRef.current) return;
    if (knownHear.current.has(last.id)) return;
    knownHear.current.add(last.id);
    heardRef.current = last.id;
    const line = spokenLine({ ...last, myLanguage: myLang });
    if (line.text) speakLine(last.id, line.text, line.lang);
  }, [hear, ended, msgs, myLang]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(`cafe-auto:${id}`) === '1') setAuto(true);
      if (sessionStorage.getItem(`cafe-told:${id}`) === '1') disclosed.current = true;
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    if (msgs.some((m) => m.mine && m.text.includes("I'm using Cultural Café to help me write"))) markDisclosed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, id]);

  const last = msgs[msgs.length - 1];
  const waitFor = last && !last.mine && !last.id.startsWith('local_') ? last.id : '';

  useEffect(() => {
    if (!auto || !guestHour) return;
    const guests = msgs.filter((m) => !m.mine);
    const lastGuest = guests.at(-1);
    if (!lastGuest) return;
    const body = visibleLine(lastGuest.translation || lastGuest.text);
    if (isClosingLine(body)) return;
    const repeated = !!body && guests.slice(0, -1).some((m) => visibleLine(m.translation || m.text) === body);
    if (!repeated) return;
    lastHandled.current = lastGuest.id;
    rememberAuto(false);
    show('Answering stopped. That line was already said.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, guestHour, msgs]);

  useEffect(() => {
    if (!auto || ended || !waitFor || waitFor === lastHandled.current || assistRef.current) {
      if (!assistRef.current) setReading(false);
      return;
    }
    const tries = autoTries.current[waitFor] ?? 0;
    if (tries >= 3) {
      lastHandled.current = waitFor;
      setReading(false);
      setError('Could not answer that line. You can write this one.');
      return;
    }
    setReading(true);
    const timer = window.setTimeout(() => {
      if (assistRef.current) {
        setNudge((n) => n + 1);
        return;
      }
      const current = msgsRef.current[msgsRef.current.length - 1];
      if (!current || current.id !== waitFor || current.mine) {
        setReading(false);
        return;
      }
      autoTries.current[waitFor] = tries + 1;
      setReading(false);
      void assist(true, waitFor);
    }, 15_000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ended, waitFor, busy, nudge, guestHour]);

  async function startAuto() {
    if (!confirm('Cultural Café will keep answering at this table. The other person will be told you are using help. You can turn it off any time. Continue?')) return;
    rememberAuto(true);
    show('Answering is on at this table. A reply goes out shortly after they write.');
  }

  async function end() {
    rememberAuto(false);
    forgetDeviceLines(id);
    await api(`/api/world/conversations/${id}/end`, { body: {} });
    router.push('/app/world');
  }

  async function block() {
    if (!conv?.peer || !confirm(t('blockConfirm', { name: conv.peer.name }))) return;
    await api('/api/world/block', { body: { userId: conv.peer.id } });
    router.push('/app/world');
  }

  async function report() {
    if (!conv?.peer) return;
    const reason = prompt(t('reportReason'), 'other');
    if (!reason) return;
    try {
      await api('/api/world/report', { body: { userId: conv.peer.id, conversationId: id, reason, detail: '' } });
      show(t('reportSent'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!conv && !error) return <Spinner />;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  const answerButtons = ready && !ended && (
    <div className="flex flex-wrap gap-2">
      <button className="btn-primary text-xs" disabled={busy || !!last?.mine} onClick={() => assist(false)}>
        {drafting ? t('writing') : t('suggest')}
      </button>
      {auto ? (
        <button className="btn-secondary text-xs" onClick={() => { rememberAuto(false); show(t('answeringOff')); }}>{t('stopAuto')}</button>
      ) : (
        <button className="btn-secondary text-xs" disabled={busy} onClick={startAuto}>
          {t('answerAuto')}
        </button>
      )}
      {hear ? (
        <button className="btn-secondary text-xs" onClick={() => rememberHear(false)}>{t('muteReplies')}</button>
      ) : (
        <button className="btn-secondary text-xs" onClick={() => rememberHear(true)}>{t('hearReplies')}</button>
      )}
    </div>
  );

  const peerName = conv?.peer?.name ?? 'They';
  const where = [conv?.peer?.city, conv?.peer?.country].filter(Boolean).join(', ');

  return (
    <div
      className="flex h-[calc(100svh-9rem-env(safe-area-inset-top))] flex-col gap-2 md:h-[calc(100dvh-7rem)] md:gap-3"
      style={keyboard > 0 ? { height: `calc(100svh - 9rem - env(safe-area-inset-top) - ${keyboard}px)` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-white">{conv?.peer ? peerName : t('cafeChat')}</h1>
          <p className="mt-0.5 text-sm text-ink-300">
            {conv?.peer ? [guestHour ? t('cafeGuest', { place: where || t('somewhere') }) : (where || t('somewhere')), conv.peer.gender === 'man' || conv.peer.gender === 'woman' ? t(conv.peer.gender) : ''].filter(Boolean).join(' · ') : t('loading')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={!ready ? 'default' : ended ? 'amber' : 'green'}>{!ready ? t('loading') : ended ? t('ended') : t('timeLeft', { time: `${mins}:${String(secs).padStart(2, '0')}` })}</Badge>
        {guestHour && <Badge>{t('guest')}</Badge>}
        {ready && !ended && <button className="btn-secondary px-3 py-1.5 text-xs" onClick={end}>{t('leaveTable')}</button>}
        <button className="btn-ghost px-2 py-1 text-xs" onClick={block}>{t('block')}</button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={report}>{t('report')}</button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={toggleKeep}>
          {keep ? t('savedDevice') : t('keepDevice')}
        </button>
      </div>
      {conv?.prompt && (
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-brand-300">{t('topic')} · {conv.prompt.title}</p>
          <p className="mt-0.5 text-base font-semibold text-white">{conv.prompt.question}</p>
          {!ended && (
            <button
              type="button"
              className="btn-secondary mt-2 px-3 py-1.5 text-xs"
              onClick={() => setText(conv.prompt!.question)}
            >
              {t('useThisLine')}
            </button>
          )}
        </div>
      )}
      {answerButtons}

      <div className="card min-h-[8rem] flex-1 space-y-3 overflow-y-auto p-3" data-world-thread data-world-peer={guestHour ? 'open' : peer}>
        {msgs.length === 0 && (
          <p className="text-sm text-ink-400">
            {t('writeHere', { name: conv?.peer?.name || t('them') })}
          </p>
        )}
        {msgs.map((m) => {
          const who = m.mine ? t('you') : (conv?.peer?.name ?? t('them'));
          const heard = spokenLine({ ...m, myLanguage: myLang });
          const main = heard.text;
          return (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'ml-auto bg-brand-500/20 text-white' : 'mr-auto bg-white/5 text-ink-100'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-300">{who}</p>
              <p className="mt-0.5 text-base" dir={isRtl(m.mine ? m.language : m.translationLang || m.language) ? 'rtl' : 'auto'}>{main}</p>
              <HearButton
                id={m.id}
                text={heard.text}
                lang={heard.lang}
                label={t('hearLine')}
                stopLabel={t('stopHear')}
                unsupported={t('speakUnsupported')}
              />
              {m.flagged && <p className="mt-1 text-[11px] text-amber-200">{t('moneyWarning')}</p>}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {!ready ? null : ended ? (
        <p className="text-sm text-ink-400">{t('tableClosed')} <a className="text-brand-300" href="/app/world">{t('backCafe')}</a></p>
      ) : (
        <div className="relative z-10 space-y-2 bg-ink-900/95">
          {error && <Alert kind="error">{error}</Alert>}
          {micPhase === 'asking' && !error && (
            <Alert>
              <p>{t('connectMic')}</p>
              <p className="mt-2">{t('micCoachLock')}</p>
              <p className="mt-1">{t('micCoachSet')}</p>
              <p className="mt-1">{t('micCoachMac')}</p>
            </Alert>
          )}
          <div className="flex gap-2">
            <textarea
              ref={box}
              className="input min-h-[3rem] flex-1 text-base"
              dir="auto"
              enterKeyHint="send"
              placeholder={micPhase === 'asking' ? t('askingMic') : micPhase === 'listening' ? t('listening') : reading ? t('reading') : auto ? t('answeringOn') : t('writePlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <DictationButton
              ref={dictate}
              lang={myLang}
              value={text}
              topic={conv?.prompt?.question ?? ''}
              onChange={setText}
              onPhase={setMicPhase}
              onError={setError}
              disabled={sending}
              label={t('speak')}
              allowLabel={t('allowMic')}
              notNowLabel={t('notNow')}
              typingLabel={t('typing')}
              stopLabel={t('stopSpeak')}
              unsupported={t('micUnsupported')}
              denied={t('micDenied')}
              boxRef={box}
            />
            <button
              type="button"
              className="btn-primary min-h-[3rem] self-end px-4"
              onTouchStart={(e) => {
                e.preventDefault();
                void send();
              }}
              onClick={() => void send()}
            >
              {sending ? t('sending') : t('send')}
            </button>
          </div>
          <p className="text-xs text-ink-400">
            {t('readsTranslation', { name: peerName })} {keep ? t('staysOnDevice') : t('nothingSaved')}
          </p>
        </div>
      )}
      {toast}
    </div>
  );
}
