/**
 * Dual view for typed words on a shared board.
 * The shared scene always keeps the original. Each person only *sees*
 * a translation — same rule as table talk.
 */

export type BoardLine = {
  id: string;
  authorId: string;
  text: string;
  language: string;
};

export type BoardReader = {
  id: string;
  language: string;
};

/** What this person should read for one box. */
export type BoardView = {
  id: string;
  text: string;
  language: string;
  /** Present when they are reading someone else's words in translation. */
  original?: string;
};

export type BoardTextElement = {
  id: string;
  type?: string;
  text?: string;
  originalText?: string;
  isDeleted?: boolean;
  customData?: { authorId?: string; language?: string };
};

export function boardLineView(line: BoardLine, reader: BoardReader, translation: string | null): BoardView {
  const original = line.text.replace(/\s+/g, ' ').trim();
  if (!original) return { id: line.id, text: '', language: line.language };
  if (line.authorId === reader.id) {
    return { id: line.id, text: original, language: line.language };
  }
  const rendered = (translation || '').replace(/\s+/g, ' ').trim();
  if (rendered && line.language !== reader.language) {
    return { id: line.id, text: rendered, language: reader.language, original };
  }
  return { id: line.id, text: original, language: line.language };
}

/** Boxes the other person wrote that this reader cannot yet read as-is. */
export function boardLinesToTranslate(lines: BoardLine[], reader: BoardReader) {
  return lines.filter((line) => {
    const text = line.text.replace(/\s+/g, ' ').trim();
    return !!text && line.authorId !== reader.id && line.language !== reader.language;
  });
}

/** Shared copy that goes on the wire. Never send a translation as the source. */
export function boardLineToShare(line: BoardLine): BoardLine {
  return {
    id: line.id,
    authorId: line.authorId,
    text: line.text.replace(/\s+/g, ' ').trim(),
    language: line.language,
  };
}

export function boardLinesFromElements(elements: BoardTextElement[]): BoardLine[] {
  const lines: BoardLine[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    const text = String(el.originalText || el.text || '').replace(/\s+/g, ' ').trim();
    if (!text || (el.type && el.type !== 'text')) continue;
    const authorId = el.customData?.authorId || '';
    const language = el.customData?.language || '';
    if (!authorId) continue;
    lines.push({ id: el.id, authorId, text, language: language || 'en' });
  }
  return lines;
}

/** Restore originals for anyone else's boxes before we save or send. */
export function restoreSharedElements<T extends BoardTextElement>(viewed: T[], source: T[]): T[] {
  const originals = new Map(source.map((el) => [el.id, el]));
  return viewed.map((el) => {
    const prev = originals.get(el.id);
    if (!prev) return el;
    if (typeof prev.text !== 'string') return el;
    const authorId = prev.customData?.authorId;
    if (!authorId) return el;
    return {
      ...el,
      text: prev.text,
      originalText: prev.originalText ?? prev.text,
      customData: { ...prev.customData, ...el.customData, authorId, language: prev.customData?.language || el.customData?.language },
    };
  });
}

/** Stamp new text boxes with the person who wrote them. */
export function stampNewText<T extends BoardTextElement>(elements: T[], reader: BoardReader): T[] {
  return elements.map((el) => {
    if (el.isDeleted || typeof el.text !== 'string') return el;
    if (el.type && el.type !== 'text') return el;
    if (el.customData?.authorId) return el;
    return {
      ...el,
      originalText: el.originalText ?? el.text,
      customData: { ...el.customData, authorId: reader.id, language: reader.language },
    };
  });
}

/** Drop translation entries for boxes that are no longer on the board. */
export function pruneBoardCaches(ids: Iterable<string>, ...maps: Record<string, string>[]) {
  const keep = new Set(ids);
  for (const map of maps) {
    for (const key of Object.keys(map)) {
      if (!keep.has(key)) delete map[key];
    }
  }
}

export function viewedElements<T extends BoardTextElement>(
  source: T[],
  reader: BoardReader,
  translations: Record<string, string>,
): T[] {
  return source.map((el) => {
    if (el.isDeleted || typeof el.text !== 'string') return el;
    if (el.type && el.type !== 'text') return el;
    const line: BoardLine = {
      id: el.id,
      authorId: el.customData?.authorId || reader.id,
      text: String(el.originalText || el.text),
      language: el.customData?.language || reader.language,
    };
    const view = boardLineView(line, reader, translations[el.id] ?? null);
    if (view.text === line.text) return el;
    return { ...el, text: view.text, originalText: line.text };
  });
}
