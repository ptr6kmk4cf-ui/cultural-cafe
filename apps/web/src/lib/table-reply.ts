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

/** A guest line can be shown when it is in the reader's language, answers the thread, and does not sound like a form. */
export function guestLineUsable(text: string, humanLang: string, already: string[], sources: string[]): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 20 || clean.length > 360) return false;
  if (STIFF.test(clean)) return false;
  if ((clean.match(/\?/g) ?? []).length > 1) return false;
  if (!translationFitsLanguage(clean, humanLang)) return false;
  const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (already.some((previous) => norm(previous) === norm(clean))) return false;
  return replyReads(clean, sources);
}

/** True when the reply uses a concrete word from what they said or from the table topic. */
export function replyReads(reply: string, sources: string[]): boolean {
  const wanted = new Set(sources.flatMap(contentWords));
  if (wanted.size === 0) return true;
  const said = new Set(contentWords(reply));
  for (const word of wanted) if (said.has(word)) return true;
  return false;
}

/** The last thing they said that is worth answering. A goodbye is skipped. */
export function lineWorthReading(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = lines[i].replace(/\s+/g, ' ').trim();
    if (text && !isClosingLine(text)) return text;
  }
  return '';
}

function titled(word: string) {
  return word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : '';
}

function topicName(topic: string) {
  const quoted = topic.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]) return quoted[1];
  return titled(contentWords(topic)[0] ?? '');
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
