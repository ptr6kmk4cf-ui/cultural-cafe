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

function shorten(text: string) {
  const clean = text.replace(/\s+/g, ' ').replace(/^["“”']+|["“”']+$/g, '').trim();
  return clean.length > 90 ? `${clean.slice(0, 87).trim()}…` : clean;
}

/**
 * A sendable line that names what they said and the table question.
 * Used when a draft ignores both.
 */
export function replyAboutTheirLine(opts: { latest?: string; topic?: string; place?: string }): string {
  const latest = lineWorthReading([opts.latest ?? '']);
  const topic = (opts.topic ?? '').replace(/\s+/g, ' ').trim();
  const place = (opts.place ?? '').replace(/\s+/g, ' ').trim();
  const snippet = latest ? shorten(latest) : '';
  const where = place ? ` Where I live, in ${place},` : '';
  if (snippet && topic) {
    return `You said “${snippet}”.${where} I want to stay with that. ${topic}`;
  }
  if (snippet) {
    return `You said “${snippet}”.${where} that is the part I am answering. What is that like where you are?`;
  }
  if (topic) return topic;
  return 'What is an ordinary day like where you are?';
}
