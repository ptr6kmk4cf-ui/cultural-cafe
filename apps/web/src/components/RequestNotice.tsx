'use client';

import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { api } from '@/lib/client';
import { publishCafePoll, requestsForMe, unheardRequestIds, type CafePoll, type RequestInvite } from '@/lib/request-notice';

const HEARD_KEY = 'cafe-request-heard';
const HIDDEN_KEY = 'cafe-request-hidden';

function readIds(key: string) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeIds(key: string, ids: Set<string>) {
  sessionStorage.setItem(key, JSON.stringify([...ids]));
}

const MAX_IDS = 80;

function keepRecent(ids: Set<string>, extra: string[] = []) {
  for (const id of extra) ids.add(id);
  if (ids.size <= MAX_IDS) return ids;
  return new Set([...ids].slice(-MAX_IDS));
}

function audioContext() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext.current) audioContext.current = new Ctx();
  return audioContext.current;
}
audioContext.current = null as AudioContext | null;

/** A short three-note chime. Returns false when the browser has not allowed sound yet. */
export function playRequestChime() {
  const context = audioContext();
  if (!context || context.state === 'suspended') {
    if (context?.state === 'suspended') void context.resume();
    return false;
  }
  const now = context.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + index * 0.11;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.07, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + 0.45);
  });
  return true;
}

export function RequestNotice() {
  const { t } = useUi();
  const [open, setOpen] = useState<RequestInvite[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const heard = useRef<Set<string>>(new Set());
  const hidden = useRef<Set<string>>(new Set());
  const waitingSound = useRef<string[]>([]);

  function remember(ids: string[]) {
    heard.current = keepRecent(heard.current, ids);
    writeIds(HEARD_KEY, heard.current);
  }

  function chimeFor(ids: string[]) {
    const fresh = unheardRequestIds(ids, heard.current);
    waitingSound.current = fresh;
    if (!fresh.length) return;
    if (playRequestChime()) remember(fresh);
  }

  useEffect(() => {
    heard.current = readIds(HEARD_KEY);
    hidden.current = readIds(HIDDEN_KEY);
    const unlock = () => {
      const context = audioContext();
      if (context?.state === 'suspended') void context.resume().then(() => chimeFor(waitingSound.current));
      else chimeFor(waitingSound.current);
    };
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      const ctx = audioContext.current;
      audioContext.current = null;
      void ctx?.close();
    };
    // The unlock listener only needs the refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    let running = false;
    async function tick() {
      if (stopped) return;
      window.clearTimeout(timer);
      if (running) return;
      running = true;
      try {
        const state = await api<CafePoll>('/api/world/requests');
        publishCafePoll(state);
        const mine = requestsForMe(state.invites);
        chimeFor(mine.map((invite) => invite.id));
        setOpen(mine.filter((invite) => !hidden.current.has(invite.id)));
        setError('');
      } catch {
        /* the page the person is on still works */
      } finally {
        running = false;
      }
      if (!stopped) timer = window.setTimeout(tick, document.hidden ? 15000 : 6000);
    }
    tick();
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    setError('');
    try {
      const result = await api<{ conversation: { id: string } | null }>(`/api/world/invites/${id}`, { body: { accept } });
      remember([id]);
      setOpen((current) => current.filter((invite) => invite.id !== id));
      if (result.conversation) {
        window.location.href = `/app/world/${result.conversation.id}`;
        return;
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  }

  function later(id: string) {
    hidden.current = keepRecent(hidden.current, [id]);
    writeIds(HIDDEN_KEY, hidden.current);
    remember([id]);
    setOpen((current) => current.filter((invite) => invite.id !== id));
  }

  if (!open.length && !error) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top))] z-50 flex justify-center px-3 md:top-4">
      <div className="pointer-events-auto w-full max-w-md space-y-2" role="status" aria-live="assertive">
        {error && <p className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white">{error}</p>}
        {open.map((invite) => {
          const name = invite.peer?.name ?? t('someone');
          const city = invite.peer?.city?.trim();
          return (
            <article key={invite.id} className="cafe-request card shadow-2xl shadow-black/40">
              <p className="font-semibold text-white">{t('wantsToSit', { name })}</p>
              <p className="mt-1 text-sm text-ink-300">{city ? `${city}. ` : ''}{t('acceptOrDecline')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!!busy} onClick={() => respond(invite.id, true)}>{t('accept')}</button>
                <button className="btn-secondary" disabled={!!busy} onClick={() => respond(invite.id, false)}>{t('decline')}</button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => later(invite.id)}>{t('later')}</button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
