import raw from './ui-messages.json';
import { uiFrom, type UiKey, type UiPack, type UiVars } from './ui-copy';

const MESSAGES = raw as Record<string, UiPack>;

export function messagesFor(lang: string): UiPack | undefined {
  if (!lang || lang === 'en') return undefined;
  return MESSAGES[lang];
}

export function ui(lang: string, key: UiKey, vars?: UiVars) {
  return uiFrom(messagesFor(lang), key, vars);
}
