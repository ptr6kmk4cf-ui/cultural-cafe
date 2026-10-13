import { LANGUAGE_ALIASES, LANGUAGE_CODES } from '@conversa/shared';

const KNOWN = new Set<string>(LANGUAGE_CODES);

function matchTag(tag: string) {
  const lowered = tag.toLowerCase();
  const base = lowered.split('-')[0] || lowered;
  const code = LANGUAGE_ALIASES[lowered] || LANGUAGE_ALIASES[base] || base;
  return KNOWN.has(code) ? code : null;
}

/** The first browser language this café can show. English when none match. */
export function localeFromAcceptLanguage(header: string | null | undefined) {
  if (!header) return 'en';
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((item) => item.trim()).find((item) => item.startsWith('q='));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((item) => item.tag && item.tag !== '*')
    .sort((a, b) => b.quality - a.quality);
  for (const item of ranked) {
    const code = matchTag(item.tag);
    if (code) return code;
  }
  return 'en';
}
