import { LANGUAGE_ALIASES, LANGUAGE_CODES } from '@conversa/shared';
import { pickLineInLanguage } from './ai/lang';

/** Region tags speechSynthesis understands. */
const SPEECH_LOCALES: Record<string, string> = {
  af: 'af-ZA',
  sq: 'sq-AL',
  am: 'am-ET',
  ar: 'ar-SA',
  hy: 'hy-AM',
  az: 'az-AZ',
  eu: 'eu-ES',
  be: 'be-BY',
  bn: 'bn-IN',
  bs: 'bs-BA',
  bg: 'bg-BG',
  my: 'my-MM',
  ca: 'ca-ES',
  zh: 'zh-CN',
  hr: 'hr-HR',
  cs: 'cs-CZ',
  da: 'da-DK',
  nl: 'nl-NL',
  en: 'en-US',
  et: 'et-EE',
  tl: 'fil-PH',
  fi: 'fi-FI',
  fr: 'fr-FR',
  gl: 'gl-ES',
  ka: 'ka-GE',
  de: 'de-DE',
  el: 'el-GR',
  gu: 'gu-IN',
  ht: 'ht-HT',
  ha: 'ha-NG',
  he: 'he-IL',
  hi: 'hi-IN',
  hu: 'hu-HU',
  is: 'is-IS',
  ig: 'ig-NG',
  id: 'id-ID',
  ga: 'ga-IE',
  it: 'it-IT',
  ja: 'ja-JP',
  jv: 'jv-ID',
  kn: 'kn-IN',
  kk: 'kk-KZ',
  km: 'km-KH',
  ko: 'ko-KR',
  ku: 'ku-TR',
  ky: 'ky-KG',
  lo: 'lo-LA',
  lv: 'lv-LV',
  lt: 'lt-LT',
  lb: 'lb-LU',
  mk: 'mk-MK',
  mg: 'mg-MG',
  ms: 'ms-MY',
  ml: 'ml-IN',
  mt: 'mt-MT',
  mi: 'mi-NZ',
  mr: 'mr-IN',
  mn: 'mn-MN',
  ne: 'ne-NP',
  no: 'nb-NO',
  ps: 'ps-AF',
  fa: 'fa-IR',
  pl: 'pl-PL',
  pt: 'pt-BR',
  pa: 'pa-IN',
  ro: 'ro-RO',
  ru: 'ru-RU',
  sr: 'sr-RS',
  si: 'si-LK',
  sk: 'sk-SK',
  sl: 'sl-SI',
  so: 'so-SO',
  es: 'es-ES',
  sw: 'sw-KE',
  sv: 'sv-SE',
  tg: 'tg-TJ',
  ta: 'ta-IN',
  te: 'te-IN',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  ur: 'ur-PK',
  uz: 'uz-UZ',
  vi: 'vi-VN',
  cy: 'cy-GB',
  xh: 'xh-ZA',
  yi: 'yi',
  yo: 'yo-NG',
  zu: 'zu-ZA',
};

function baseCode(code: string | null | undefined) {
  const raw = (code || '').trim().toLowerCase().replace(/_/g, '-');
  const base = raw.split('-')[0] || '';
  return LANGUAGE_ALIASES[base] || LANGUAGE_ALIASES[raw] || base;
}

/** BCP-47 tag for the café language, so the mic and speaker use the same tongue you read. */
export function speechLocale(code: string | null | undefined, fallback = 'en'): string {
  const raw = (code || '').trim().toLowerCase().replace(/_/g, '-');
  const mapped = baseCode(raw) || fallback;
  const region = raw.split('-')[1] || '';
  if (region.length === 2 && (LANGUAGE_CODES as readonly string[]).includes(mapped)) {
    return `${mapped}-${region.toUpperCase()}`;
  }
  return SPEECH_LOCALES[mapped] || SPEECH_LOCALES[baseCode(fallback)] || 'en-US';
}

/** Drops a pasted quote so an old line does not sit in front of the new one. */
export function visibleLine(raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text.startsWith('“') && !text.startsWith('"')) return text;
  const last = text.split(' — ').pop()?.trim() ?? '';
  return last || text;
}

export type ComposePair = { my: string; their: string };

export function emptyComposePair(): ComposePair {
  return { my: '', their: '' };
}

/** A new typed or suggested line belongs to the view you are in. The other view is stale. */
export function composePairFromEdit(inTheirs: boolean, value: string): ComposePair {
  return inTheirs ? { my: '', their: value } : { my: value, their: '' };
}

/** Keep both sides when you only switch view, so the unsent line can flip like their messages. */
export function composePairFromSwitch(pair: ComposePair, fromTheirs: boolean, current: string): ComposePair {
  return fromTheirs ? { ...pair, their: current } : { ...pair, my: current };
}

export function composeAfterSwitch(pair: ComposePair, toTheirs: boolean): { text: string; needsTranslation: boolean } {
  const cached = (toTheirs ? pair.their : pair.my).replace(/\s+/g, ' ').trim();
  if (cached) return { text: cached, needsTranslation: false };
  const source = (toTheirs ? pair.my : pair.their).replace(/\s+/g, ' ').trim();
  return { text: source, needsTranslation: !!source };
}

/** Fill the idle side of a draft so a language switch does not wait. */
export function fillComposeOther(pair: ComposePair, fromTheirs: boolean, other: string): ComposePair {
  const next = other.replace(/\s+/g, ' ').trim();
  if (!next) return pair;
  return fromTheirs ? { ...pair, my: pair.my || next } : { ...pair, their: pair.their || next };
}

/** A late Suggest must land in the view you have now, not the one you had when you tapped. */
export function placeAssistDraft(opts: { draft: string; wroteTheirs: boolean; nowTheirs: boolean; pair?: ComposePair }) {
  const pair = composePairFromEdit(opts.wroteTheirs, opts.draft);
  if (opts.wroteTheirs === opts.nowTheirs) {
    return { pair, display: opts.draft.replace(/\s+/g, ' ').trim(), needsFlip: false };
  }
  const next = composeAfterSwitch(pair, opts.nowTheirs);
  return { pair, display: next.text, needsFlip: next.needsTranslation };
}

/** The words this person should hear, in a language they can follow. */
export function spokenLine(m: {
  mine: boolean;
  text: string;
  language?: string | null;
  translation?: string | null;
  translationLang?: string | null;
  myLanguage: string;
  theirLanguage?: string | null;
  /** Read and hear their original, not the translation into your language. */
  inTheirLanguage?: boolean;
}) {
  const original = visibleLine(m.text);
  const translated = visibleLine(m.translation || '');
  const theirLang = m.theirLanguage || m.language || '';
  if (m.inTheirLanguage) {
    const pool = m.mine ? [original, translated] : [original];
    const inTheirs = theirLang ? pickLineInLanguage(pool, theirLang) : '';
    const inMine = pickLineInLanguage(m.mine ? [original, translated] : [original], m.myLanguage);
    const text = inTheirs || (!inMine ? original : '');
    return { text, lang: theirLang || m.language || m.myLanguage };
  }
  if (m.mine) {
    const mine = pickLineInLanguage([original, translated], m.myLanguage);
    return { text: mine || original, lang: m.language || m.myLanguage };
  }
  const mine = pickLineInLanguage([translated, original], m.myLanguage);
  return { text: mine, lang: m.myLanguage };
}

/** Stitches live dictation onto the line that was already in the box. */
export function joinDictation(...parts: string[]) {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/** Mime Chrome or Safari can record, so Stop has a clip to turn into words. */
export function recorderMime(supported: (type: string) => boolean) {
  return RECORDER_TYPES.find((type) => supported(type)) || '';
}

export const LIVE_TRANSCRIBE_GAP_MS = 1400;
export const LIVE_TRANSCRIBE_MIN_BYTES = 1500;

/** Drop a late transcript so an older clip cannot overwrite what you just said. */
export function shouldPaintLiveTranscript(gen: number, latest: number, text: string) {
  return gen === latest && !!(text || '').trim();
}

export const TALK_SILENCE_MS = 1200;
export const WORD_QUIET_MS = 3600;
export const TYPING_HOLD_MS = 1500;

/** Chrome drops a long utterance after ~15s. Keep each piece under that. */
export const SPEAK_CHUNK_MAX = 180;
/** Pause/resume before Chrome's speech engine times out. */
export const SPEAK_KEEPALIVE_MS = 9000;
/** After cancel(), Chrome drops a speak until the engine is idle. */
export const SPEAK_AFTER_CANCEL_MS = 80;
export const SPEAK_IDLE_WAIT_MS = 1000;

/** The last line Hear should read when you turn it on. Your own bubbles stay quiet. */
export function lastHearable<T extends { id: string; mine?: boolean }>(msgs: T[]) {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const line = msgs[i];
    if (line && !line.mine && !line.id.startsWith('local_')) return line;
  }
  return undefined;
}

export function lastHearableId(msgs: { id: string; mine?: boolean }[]) {
  return lastHearable(msgs)?.id || '';
}

/** 0 = start now. Otherwise retry after this many ms until the previous line is gone. */
export function nextSpeechTryMs(busy: boolean, waitedMs: number, cap = SPEAK_IDLE_WAIT_MS) {
  if (busy && waitedMs < cap) return SPEAK_AFTER_CANCEL_MS;
  return 0;
}

/** Chromium (not iOS WebKit) is the engine that goes silent mid-line. */
export function needsSpeakKeepAlive(ua = '') {
  if (/iPhone|iPad|iPod|CriOS|FxiOS/.test(ua)) return false;
  return /Chrome|Chromium|Edg\//.test(ua);
}

function breakLongSpeakPiece(text: string): string[] {
  if (text.length <= SPEAK_CHUNK_MAX) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > SPEAK_CHUNK_MAX) {
    const slice = rest.slice(0, SPEAK_CHUNK_MAX);
    const cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' '), slice.lastIndexOf('، '));
    const at = cut >= Math.floor(SPEAK_CHUNK_MAX * 0.4) ? cut + 1 : SPEAK_CHUNK_MAX;
    const piece = rest.slice(0, at).trim();
    if (piece) out.push(piece);
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Split a table line so Hear can finish every sentence, not just the first few. */
export function splitSpeakChunks(text: string): string[] {
  const body = text.replace(/\s+/g, ' ').trim();
  if (!body) return [];
  const pieces = body.split(/(?<=[.!?…。．;；])\s+/u).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const part of pieces.length ? pieces : [body]) {
    if (!buf) {
      buf = part;
      continue;
    }
    if (`${buf} ${part}`.length <= SPEAK_CHUNK_MAX) {
      buf = `${buf} ${part}`;
      continue;
    }
    chunks.push(...breakLongSpeakPiece(buf));
    buf = part;
  }
  if (buf) chunks.push(...breakLongSpeakPiece(buf));
  return chunks;
}

/** Speak stays on Typing while you talk, then Stop once you go quiet. */
export function dictationButtonKind(hearing: boolean, spoken: boolean, openForMs: number): 'typing' | 'stop' {
  if (openForMs < TYPING_HOLD_MS) return 'typing';
  return hearing || !spoken ? 'typing' : 'stop';
}
