'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { api } from '@/lib/client';
import {
  dictationButtonKind,
  joinDictation,
  LIVE_TRANSCRIBE_GAP_MS,
  LIVE_TRANSCRIBE_MIN_BYTES,
  recorderMime,
  shouldPaintLiveTranscript,
  speechLocale,
  TALK_SILENCE_MS,
  TYPING_HOLD_MS,
  WORD_QUIET_MS,
} from '@/lib/speech';

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new DOMException('Microphone is not available.', 'NotSupportedError'));
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

type SpeakListener = (id: string | null) => void;
let speakingId: string | null = null;
const speakListeners = new Set<SpeakListener>();

function notifySpeak(id: string | null) {
  speakingId = id;
  for (const listener of speakListeners) listener(id);
}

function pickVoice(locale: string) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lower = locale.toLowerCase();
  const base = lower.split('-')[0] || lower;
  return (
    voices.find((v) => v.lang.toLowerCase() === lower) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

/** Safari only unlocks voices after a tap. A silent period is enough. */
export function unlockSpeech() {
  if (!canSpeak()) return;
  window.speechSynthesis.getVoices();
  const warm = new SpeechSynthesisUtterance('.');
  warm.volume = 0;
  window.speechSynthesis.speak(warm);
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  notifySpeak(null);
}

export function speakLine(id: string, text: string, lang: string) {
  const body = text.replace(/\s+/g, ' ').trim();
  if (!body || !canSpeak()) return false;
  window.speechSynthesis.cancel();
  const locale = speechLocale(lang);
  const utter = new SpeechSynthesisUtterance(body);
  utter.lang = locale;
  const voice = pickVoice(locale);
  if (voice) utter.voice = voice;
  utter.onend = () => {
    if (speakingId === id) notifySpeak(null);
  };
  utter.onerror = () => {
    if (speakingId === id) notifySpeak(null);
  };
  notifySpeak(id);
  window.speechSynthesis.speak(utter);
  return true;
}

function useSpeakingId() {
  const [id, setId] = useState<string | null>(speakingId);
  useEffect(() => {
    speakListeners.add(setId);
    return () => {
      speakListeners.delete(setId);
    };
  }, []);
  return id;
}

export function HearButton({
  id,
  text,
  lang,
  label,
  stopLabel,
  unsupported,
}: {
  id: string;
  text: string;
  lang: string;
  label: string;
  stopLabel: string;
  unsupported: string;
}) {
  const current = useSpeakingId();
  const playing = current === id;
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      className={`btn-ghost mt-1 h-7 px-2 text-[11px] ${playing ? 'text-brand-200' : ''}`}
      aria-label={playing ? stopLabel : label}
      aria-pressed={playing}
      onClick={() => {
        if (playing) {
          stopSpeaking();
          return;
        }
        if (!canSpeak() || !speakLine(id, text, lang)) {
          window.alert(unsupported);
        }
      }}
    >
      {playing ? (
        <span className="inline-flex items-center gap-1">
          <StopIcon /> {stopLabel}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <SpeakerIcon /> {label}
        </span>
      )}
    </button>
  );
}

async function transcribeClip(blob: Blob, language: string, topic: string) {
  const type = blob.type || 'audio/webm';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new File([blob], `speech.${ext}`, { type }));
  form.append('language', language);
  if (topic) form.append('topic', topic.slice(0, 300));
  const data = await api<{ text: string }>('/api/ai/transcribe', { form });
  return (data.text || '').trim();
}

export type DictationHandle = { hangUp: () => void };

export const DictationButton = forwardRef<
  DictationHandle,
  {
    lang: string;
    value: string;
    onChange: (next: string) => void;
    onPhase?: (phase: 'idle' | 'asking' | 'listening') => void;
    onError?: (message: string) => void;
    disabled?: boolean;
    label: string;
    allowLabel: string;
    notNowLabel: string;
    typingLabel: string;
    stopLabel: string;
    unsupported: string;
    denied: string;
    topic?: string;
    boxRef?: RefObject<HTMLTextAreaElement | null>;
  }
>(function DictationButton(
  {
    lang,
    value,
    onChange,
    onPhase,
    onError,
    disabled,
    label,
    allowLabel,
    notNowLabel,
    typingLabel,
    stopLabel,
    unsupported,
    denied,
    topic = '',
    boxRef,
  },
  ref,
) {
  const [phase, setPhase] = useState<'idle' | 'asking' | 'listening'>('idle');
  const [hearing, setHearing] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [held, setHeld] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickTimerRef = useRef(0);
  const holdTimerRef = useRef(0);
  const quietTimerRef = useRef(0);
  const hearingLoopRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const listeningRef = useRef(false);
  const wantMicRef = useRef(false);
  const liveRef = useRef(true);
  const stoppingRef = useRef(false);
  const liveBusyRef = useRef(false);
  const liveGenRef = useRef(0);
  const heardRef = useRef('');
  const spokenRef = useRef(false);
  const hearingRef = useRef(false);
  const lastVoiceAt = useRef(0);
  const baseRef = useRef('');
  const valueRef = useRef(value);
  const topicRef = useRef(topic);
  valueRef.current = value;
  topicRef.current = topic;

  function setPhaseNow(next: 'idle' | 'asking' | 'listening') {
    listeningRef.current = next === 'listening';
    if (next === 'idle') {
      wantMicRef.current = false;
      stoppingRef.current = false;
      spokenRef.current = false;
      hearingRef.current = false;
      setHearing(false);
      setSpoken(false);
      setHeld(false);
    }
    setPhase(next);
    onPhase?.(next);
  }

  function clipBlob() {
    const rec = recorderRef.current;
    const type = rec?.mimeType || chunksRef.current[0]?.type || 'audio/webm';
    return new Blob(chunksRef.current, { type });
  }

  function stopHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = 0;
    }
    if (quietTimerRef.current) {
      window.clearTimeout(quietTimerRef.current);
      quietTimerRef.current = 0;
    }
  }

  function stopLiveTicks() {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = 0;
    }
    stopHoldTimer();
  }

  function releaseMic() {
    stopLiveTicks();
    if (hearingLoopRef.current) cancelAnimationFrame(hearingLoopRef.current);
    hearingLoopRef.current = 0;
    const ctx = audioRef.current;
    audioRef.current = null;
    void ctx?.close();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    stopStream(streamRef.current);
    streamRef.current = null;
  }

  function fail(message: string) {
    releaseMic();
    setPhaseNow('idle');
    onError?.(message);
  }

  function startRecorder(stream: MediaStream) {
    chunksRef.current = [];
    const mime = recorderMime((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type));
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
    rec.ondataavailable = (ev) => {
      if (ev.data?.size) chunksRef.current.push(ev.data);
    };
    recorderRef.current = rec;
    rec.start(250);
  }

  function noteVoice(on: boolean) {
    if (on) {
      lastVoiceAt.current = Date.now();
      if (!spokenRef.current) {
        spokenRef.current = true;
        setSpoken(true);
      }
      if (!hearingRef.current) {
        hearingRef.current = true;
        setHearing(true);
      }
      return;
    }
    if (!spokenRef.current || !hearingRef.current) return;
    if (Date.now() - lastVoiceAt.current < TALK_SILENCE_MS) return;
    hearingRef.current = false;
    setHearing(false);
  }

  function startLevelMeter(stream: MediaStream) {
    const Ctor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    audioRef.current = ctx;
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    lastVoiceAt.current = Date.now();
    const armedAt = Date.now() + 400;
    const tick = () => {
      if (!listeningRef.current || stoppingRef.current) return;
      if (Date.now() < armedAt) {
        hearingLoopRef.current = requestAnimationFrame(tick);
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const n = (sample - 128) / 128;
        sum += n * n;
      }
      noteVoice(Math.sqrt(sum / data.length) > 0.05);
      hearingLoopRef.current = requestAnimationFrame(tick);
    };
    hearingLoopRef.current = requestAnimationFrame(tick);
  }

  async function pullLiveTranscript() {
    if (!listeningRef.current || stoppingRef.current || liveBusyRef.current) return;
    const blob = clipBlob();
    if (blob.size < LIVE_TRANSCRIBE_MIN_BYTES) return;
    liveBusyRef.current = true;
    const gen = ++liveGenRef.current;
    try {
      const said = await transcribeClip(blob, lang, topicRef.current);
      if (!shouldPaintLiveTranscript(gen, liveGenRef.current, said)) return;
      if (!listeningRef.current && !stoppingRef.current) return;
      heardRef.current = said;
      if (!spokenRef.current) {
        spokenRef.current = true;
        setSpoken(true);
      }
      hearingRef.current = true;
      setHearing(true);
      if (quietTimerRef.current) window.clearTimeout(quietTimerRef.current);
      quietTimerRef.current = window.setTimeout(() => {
        hearingRef.current = false;
        setHearing(false);
      }, WORD_QUIET_MS);
      onChange(joinDictation(baseRef.current, said));
    } catch {
      /* the next tick tries again */
    } finally {
      if (gen === liveGenRef.current) liveBusyRef.current = false;
    }
  }

  function startLiveTicks() {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = 0;
    }
    tickTimerRef.current = window.setInterval(() => {
      void pullLiveTranscript();
    }, LIVE_TRANSCRIBE_GAP_MS);
  }

  function hangUp() {
    if (!listeningRef.current && !wantMicRef.current) return;
    stoppingRef.current = true;
    liveGenRef.current += 1;
    listeningRef.current = false;
    heardRef.current = '';
    releaseMic();
    setPhaseNow('idle');
  }

  useImperativeHandle(ref, () => ({ hangUp }));

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      listeningRef.current = false;
      releaseMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!disabled) return;
    hangUp();
  }, [disabled]);

  function cancelAsk() {
    wantMicRef.current = false;
    releaseMic();
    setPhaseNow('idle');
  }

  function connect() {
    if (listeningRef.current || wantMicRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      fail(unsupported);
      return;
    }
    stoppingRef.current = false;
    wantMicRef.current = true;
    liveBusyRef.current = false;
    liveGenRef.current += 1;
    heardRef.current = '';
    spokenRef.current = false;
    hearingRef.current = true;
    setSpoken(false);
    setHeld(false);
    setHearing(true);
    stopSpeaking();
    onError?.('');
    baseRef.current = valueRef.current;
    chunksRef.current = [];
    setPhaseNow('asking');
    requestMicrophone()
      .then((stream) => {
        if (!liveRef.current || !wantMicRef.current) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        startRecorder(stream);
        startLevelMeter(stream);
        setPhaseNow('listening');
        startLiveTicks();
        holdTimerRef.current = window.setTimeout(() => {
          if (listeningRef.current) setHeld(true);
        }, TYPING_HOLD_MS);
        boxRef?.current?.focus();
      })
      .catch((err) => {
        const name = err instanceof DOMException ? err.name : '';
        fail(name === 'NotFoundError' || name === 'NotSupportedError' ? unsupported : denied);
      });
  }

  async function finishClip() {
    const rec = recorderRef.current;
    if (rec) rec.onstop = null;
    const blob = clipBlob();
    const already = heardRef.current;
    const gen = liveGenRef.current;
    const base = baseRef.current;
    releaseMic();
    setPhaseNow('idle');
    if (already) return;
    if (blob.size < 200) {
      onError?.(unsupported);
      return;
    }
    try {
      const said = await transcribeClip(blob, lang, topicRef.current);
      if (gen !== liveGenRef.current) return;
      if (said) onChange(joinDictation(base, said));
      else onError?.(unsupported);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : unsupported);
    }
  }

  function stop() {
    if (!listeningRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    liveGenRef.current += 1;
    listeningRef.current = false;
    setPhase('idle');
    onPhase?.('idle');
    stopLiveTicks();
    if (heardRef.current) onChange(joinDictation(baseRef.current, heardRef.current));
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        void finishClip();
      };
      try {
        rec.stop();
      } catch {
        void finishClip();
      }
      return;
    }
    if (chunksRef.current.length || heardRef.current) {
      void finishClip();
      return;
    }
    fail(unsupported);
  }

  const listening = phase === 'listening';
  const asking = phase === 'asking';
  const talking = listening && dictationButtonKind(hearing, spoken, held ? TYPING_HOLD_MS : 0) === 'typing';
  const action = talking ? typingLabel : listening ? stopLabel : asking ? allowLabel : label;

  return (
    <div className="flex gap-2 self-end">
      {asking && (
        <button type="button" className="btn-ghost min-h-[3rem] px-3" disabled={disabled} onClick={cancelAsk}>
          {notNowLabel}
        </button>
      )}
      <button
        type="button"
        className={`min-h-[3rem] px-3 ${listening ? 'btn-danger cafe-mic' : asking ? 'btn-primary cafe-mic-ask' : 'btn-secondary'}`}
        aria-label={action}
        aria-pressed={listening}
        disabled={disabled || asking}
        onClick={() => {
          if (listening) stop();
          else connect();
        }}
      >
        {listening && !talking ? <MicOffIcon /> : <MicIcon />}
        <span>{action}</span>
      </button>
    </div>
  );
});
DictationButton.displayName = 'DictationButton';

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" strokeLinecap="round" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" strokeLinecap="round" />
      <path d="M5 5l14 14" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 10v4h3l5 4V6L7 10H4z" strokeLinejoin="round" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a6 6 0 0 1 0 10" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}
