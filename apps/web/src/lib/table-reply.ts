import { translationFitsLanguage } from './ai/lang';

/** A guest goodbye is not something to thank them for. A real stop request still is. */
export function isClosingLine(text: string) {
  return /\b(let'?s stop|stop (here|there)|we (can |should )?stop|take care|goodbye|good bye|on s['’]arr[eê]te|prends soin)\b/i.test(text);
}

const COMMON = new Set([
  'what', 'like', 'likes', 'where', 'your', 'yours', 'you', 'live', 'lives', 'living', 'that', 'this', 'with', 'from',
  'have', 'has', 'they', 'them', 'their', 'about', 'there', 'here', 'just', 'very', 'really', 'would', 'could',
  'should', 'thank', 'thanks', 'telling', 'normal', 'day', 'days', 'people', 'city', 'when', 'does', 'how', 'the',
  'and', 'for', 'are', 'was', 'were', 'been', 'into', 'over', 'after', 'before', 'please', 'want', 'know', 'said',
  'says', 'tell', 'told', 'mine', 'ours', 'our', 'not', 'but', 'can', 'will', 'than', 'then', 'too', 'also', 'its',
  'who', 'why', 'which', 'whom', 'whose', 'being', 'did', 'doing', 'done', 'get', 'got', 'let', 'lets', 'take',
  'care', 'yourself', 'okay', 'all', 'right', 'stop', 'good', 'bye', 'hello', 'france', 'lyon',
]);

/** Words that would show the reply actually used the thread, not a stock question. */
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !COMMON.has(word));
}

const STIFF = /\b(i am glad to hear|glad to hear that|you mentioned|thank you for telling|you said|as an ai|language model|the part i am answering)\b/i;

export function normGuestLine(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when the next guest line is the last one again, a suffix of it, or the same words reshuffled. */
export function guestLineRepeats(text: string, already: string[]): boolean {
  const clean = normGuestLine(text);
  if (!clean) return true;
  const recent = already.slice(-3).map(normGuestLine).filter(Boolean);
  for (const prior of recent) {
    if (prior === clean) return true;
    const shorter = prior.length <= clean.length ? prior : clean;
    const longer = prior.length <= clean.length ? clean : prior;
    if (shorter.length >= 24 && longer.includes(shorter)) return true;
    const priorWords = contentWords(prior);
    const nextWords = contentWords(clean);
    const basis = Math.min(priorWords.length, nextWords.length);
    if (basis < 3) continue;
    const priorSet = new Set(priorWords);
    const shared = nextWords.filter((word) => priorSet.has(word)).length;
    if (shared / basis >= 0.7) return true;
  }
  return false;
}

/** A guest line is new enough to send: right language, not a form, not a copy of the last turns. */
export function guestLineFresh(text: string, humanLang: string, already: string[]): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 20 || clean.length > 360) return false;
  if (STIFF.test(clean)) return false;
  if ((clean.match(/\?/g) ?? []).length > 1) return false;
  if (!translationFitsLanguage(clean, humanLang)) return false;
  if (already.some((previous) => normGuestLine(previous) === normGuestLine(clean))) return false;
  if (guestLineRepeats(clean, already)) return false;
  return true;
}

/** A guest line can be shown when it is in the reader's language, answers the thread, and does not sound like a form. */
export function guestLineUsable(text: string, humanLang: string, already: string[], sources: string[]): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!guestLineFresh(clean, humanLang, already)) return false;
  if (draftEchoes(clean, sources[0] ?? '', sources[1] ?? '')) return false;
  return staysOnTable(clean, sources[0] ?? '', sources[1] ?? '');
}

/** True when the reply uses a concrete word from what they said or from the table topic. */
export function replyReads(reply: string, sources: string[]): boolean {
  const wanted = new Set(sources.flatMap(contentWords));
  if (wanted.size === 0) return true;
  const said = new Set(contentWords(reply));
  for (const word of wanted) if (said.has(word)) return true;
  return false;
}

/** True when a line stays on what they just said or on the table topic. */
export function staysOnTable(reply: string, latest: string, topic: string) {
  const focus = lastSpokenLine(latest || '');
  const subject = (topic || '').replace(/\s+/g, ' ').trim();
  if (replyReads(reply, [focus])) return true;
  if (replyReads(reply, [subject])) return true;
  return contentWords(focus).length === 0 && contentWords(subject).length === 0;
}

/** The last thing they said that is worth answering. A goodbye is skipped. */
export function lineWorthReading(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = lines[i].replace(/\s+/g, ' ').trim();
    if (text && !isClosingLine(text)) return text;
  }
  return '';
}

/** The last sentence they typed. An older question still sitting in the box is ignored. */
export function lastSpokenLine(raw: string) {
  const clean = raw.replace(/\s+/g, ' ').trim();
  const parts = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.at(-1) ?? clean;
}

function titled(word: string) {
  return word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : '';
}

function topicName(topic: string) {
  const quoted = topic.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]) return quoted[1];
  return titled(contentWords(topic)[0] ?? '');
}

/** The short name of the table subject, so a reply can stay on it. */
export function tableSubject(topic: string) {
  return topicName(topic);
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function soundsLikeTopicWord(heard: string, wanted: string) {
  if (heard === wanted) return false;
  const max = wanted.length >= 6 ? 2 : 1;
  if (heard.length < 4 || wanted.length < 4) return false;
  if (heard[0] !== wanted[0]) return false;
  if (Math.abs(heard.length - wanted.length) > max) return false;
  return editDistance(heard, wanted) <= max;
}

function keepTokenCase(token: string, next: string) {
  const match = token.match(/^(\P{L}*)(\p{L}+)(\P{L}*)$/u);
  if (!match) return next;
  const [, pre, word, post] = match;
  const cased = word[0] === word[0].toLocaleUpperCase() ? titled(next) : next;
  return `${pre}${cased}${post}`;
}

/** Fixes a speech-to-text near miss so the line stays on the table topic. Clear off-topic speech is left alone. */
export function correctSpokenLine(text: string, topic: string, latest = '') {
  const clean = text.replace(/\s+/g, ' ').trim();
  const subject = (topic || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (!subject) return clean;
  if (replyReads(clean, [subject])) return clean;
  if (latest && staysOnTable(clean, latest, subject)) return clean;
  const wanted = [
    ...new Set(
      [tableSubject(subject).toLowerCase(), ...contentWords(subject).filter((word) => word.length >= 6)].filter(
        (word) => word.length >= 4,
      ),
    ),
  ];
  const tokens = clean.split(/\s+/);
  let changed = false;
  const next = tokens.map((token) => {
    const heard = token.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const hit = wanted.find((word) => soundsLikeTopicWord(heard, word));
    if (!hit) return token;
    changed = true;
    return keepTokenCase(token, hit);
  });
  const fixed = next.join(' ');
  if (changed && replyReads(fixed, [subject])) return fixed;
  return clean;
}

const WEAK_WORDS = new Set(['something', 'actually', 'makes', 'until', 'deserve', 'legitimate', 'only', 'suggestion', 'really']);

/** A few everyday words, with more than one way to answer so the line does not sound stamped. */
const PICTURES: Record<string, string[]> = {
  bakery: [
    'I would let the bakery stop me too. A red light I still obey.',
    'The bakery is a better reason to pause than the plan I had.',
  ],
  bike: [
    'I get off the bike when I want something warm. Hunger beats the rest of the route.',
    'The bike can wait. I stop when a warm place wins.',
  ],
  rain: [
    'Rain pulls me toward the nearest warm door. I do not mind a longer line for that.',
    'In the rain I pick the closer bakery and call it the plan.',
  ],
  light: [
    'I still stop for the light. A warm place is the exception I allow.',
    'The light I obey. Everything else can wait a minute.',
  ],
  brake: [
    'A bakery as a brake makes sense to me. I am less flexible about the light.',
  ],
  bread: [
    'Warm bread is enough to end the walk. I would stop there too.',
  ],
  seat: [
    'A wet seat is a real reason to go inside. I would do the same.',
  ],
};

function lineNumber(text: string, size: number) {
  let n = 0;
  for (const ch of text) n = (n + ch.charCodeAt(0)) % size;
  return n;
}

function speakableWords(latest: string) {
  const tokens = latest.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const words: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const lower = tokens[index].toLowerCase();
    if (lower.length <= 3 || COMMON.has(lower) || WEAK_WORDS.has(lower)) continue;
    const proper = index > 0 && tokens[index][0] === tokens[index][0].toLocaleUpperCase();
    if (proper) continue;
    words.push(lower);
  }
  return words;
}

/** True when a draft quotes their line or pastes the table question again. */
export function draftEchoes(text: string, latest: string, topic: string) {
  if (STIFF.test(text)) return true;
  const clean = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const said = latest.replace(/\s+/g, ' ').trim();
  if (said.length >= 24 && clean.includes(said.slice(0, 40).toLowerCase())) return true;
  const question = topic.replace(/\s+/g, ' ').trim().toLowerCase();
  return question.length >= 16 && clean.includes(question);
}

/**
 * A sendable line that answers what they just said.
 * It does not quote them, and it does not reuse one stamped sentence.
 */
export function replyAboutTheirLine(opts: { latest?: string; topic?: string; place?: string }): string {
  const latest = lineWorthReading([opts.latest ?? '']);
  const topic = (opts.topic ?? '').replace(/\s+/g, ' ').trim();
  const place = (opts.place ?? '').replace(/\s+/g, ' ').trim();
  const words = speakableWords(latest);
  const word = words.find((item) => PICTURES[item]) ?? words[0] ?? '';
  const pictures = PICTURES[word];
  if (pictures) return pictures[lineNumber(latest, pictures.length)];
  if (word) {
    const home = place ? ` In ${place} that is enough of a reason.` : '';
    const lines = [
      `I would pause for the ${word} too.${home}`,
      `The ${word} would change my afternoon.${home}`,
      `I keep a soft spot for the ${word}.${home}`,
    ];
    return lines[lineNumber(latest, lines.length)];
  }
  const subject = topicName(topic);
  if (subject) return place ? `I can tell you about ${subject} from ${place}.` : `I can tell you about ${subject}.`;
  return 'What is an ordinary day like where you are?';
}
