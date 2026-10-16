import { LANGUAGE_ALIASES, LANGUAGE_CODES } from '@conversa/shared';

const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'you', 'what', 'is', 'are', 'how', 'your', 'have', 'do', 'that', 'this', 'with', 'i', 'my'],
  fr: ['le', 'la', 'les', 'et', 'est', 'tu', 'vous', 'que', 'je', 'pas', 'une', 'des', 'pour', 'avec', 'ça', 'mon', 'ton', 'salut', 'bonjour', 'ce', 'quoi', 'fais', 'oui', 'merci', 'tes', 'mais'],
  es: ['el', 'la', 'los', 'y', 'es', 'que', 'tú', 'qué', 'una', 'para', 'con', 'pero', 'hola', 'yo', 'mi', 'tu', 'muy', 'también'],
  de: ['der', 'die', 'das', 'und', 'ist', 'du', 'ich', 'nicht', 'ein', 'eine', 'mit', 'auch', 'hallo', 'mein', 'dein', 'wie', 'was'],
  it: ['il', 'la', 'e', 'è', 'che', 'non', 'una', 'per', 'con', 'ciao', 'sono', 'mi', 'ti', 'anche', 'come', 'cosa'],
  pt: ['o', 'a', 'os', 'e', 'é', 'que', 'não', 'uma', 'para', 'com', 'olá', 'oi', 'você', 'eu', 'meu', 'também', 'muito'],
  nl: ['de', 'het', 'en', 'is', 'een', 'je', 'ik', 'niet', 'van', 'met', 'ook', 'hallo', 'hoi', 'wat', 'jij', 'mijn'],
  pl: ['jest', 'nie', 'się', 'jak', 'co', 'ja', 'ty', 'mnie', 'cześć', 'dzień', 'dobry', 'czy', 'też', 'mój', 'twój', 'bardzo', 'że'],
  tr: ['bir', 've', 'bu', 'ne', 'nasıl', 'merhaba', 'ben', 'sen', 'çok', 'mi', 'mı', 'da', 'de', 'için', 'ama', 'var', 'yok', 'günün'],
  sv: ['och', 'är', 'jag', 'du', 'det', 'inte', 'en', 'att', 'hej', 'vad', 'hur', 'min', 'din', 'också', 'med', 'mycket'],
  da: ['og', 'er', 'jeg', 'du', 'det', 'ikke', 'en', 'at', 'hej', 'hvad', 'hvordan', 'min', 'din', 'også', 'med', 'meget'],
  no: ['og', 'er', 'jeg', 'du', 'det', 'ikke', 'en', 'å', 'hei', 'hva', 'hvordan', 'min', 'din', 'også', 'med', 'veldig'],
  ro: ['și', 'este', 'eu', 'tu', 'nu', 'ce', 'faci', 'salut', 'bună', 'pentru', 'cu', 'foarte', 'meu', 'tău', 'care'],
  id: ['dan', 'yang', 'aku', 'kamu', 'apa', 'tidak', 'ini', 'itu', 'halo', 'hai', 'juga', 'dengan', 'sangat', 'saya', 'kabar'],
  vi: ['và', 'là', 'tôi', 'bạn', 'không', 'có', 'của', 'chào', 'gì', 'rất', 'em', 'anh', 'được', 'này'],
  cs: ['je', 'a', 'jsem', 'ty', 'ne', 'co', 'jak', 'ahoj', 'taky', 'moc', 'můj', 'tvůj', 'se', 'že'],
  hu: ['és', 'az', 'egy', 'vagy', 'nem', 'én', 'te', 'mi', 'hogy', 'szia', 'helló', 'is', 'nagyon', 'mit'],
  fi: ['ja', 'on', 'minä', 'sinä', 'ei', 'mitä', 'miten', 'moi', 'hei', 'myös', 'kanssa', 'tosi', 'mun', 'sun'],
  sw: ['na', 'ni', 'mimi', 'wewe', 'habari', 'sana', 'kwa', 'je', 'hapana', 'ndiyo', 'yako', 'yangu', 'leo'],
  tl: ['ang', 'ng', 'mga', 'ako', 'ikaw', 'ka', 'ko', 'mo', 'kumusta', 'po', 'naman', 'lang', 'hindi', 'oo', 'sa'],
};

/** Non-Latin scripts, most specific first (e.g. Persian letters before generic Arabic script). */
const SCRIPTS: [RegExp, string][] = [
  [/[\u3040-\u30FF]/, 'ja'],
  [/[\uAC00-\uD7AF\u1100-\u11FF]/, 'ko'],
  [/[\u4E00-\u9FFF]/, 'zh'],
  [/[\u05F0-\u05F2\uFB1F]/, 'yi'],
  [/[\u0590-\u05FF]/, 'he'],
  [/[ٹڈڑںےۓھ]/, 'ur'],
  [/[ځڅډړږښڼ]/, 'ps'],
  [/[پچژگکی]/, 'fa'],
  [/[\u0600-\u06FF]/, 'ar'],
  [/[іїєґ]/i, 'uk'],
  [/[ў]/i, 'be'],
  [/[әғқңұһ]/i, 'kk'],
  [/[\u0400-\u04FF]/, 'ru'],
  [/[\u0370-\u03FF]/, 'el'],
  [/[\u0E00-\u0E7F]/, 'th'],
  [/[\u0E80-\u0EFF]/, 'lo'],
  [/[\u1780-\u17FF]/, 'km'],
  [/[\u1000-\u109F]/, 'my'],
  [/[\u0980-\u09FF]/, 'bn'],
  [/[\u0A00-\u0A7F]/, 'pa'],
  [/[\u0A80-\u0AFF]/, 'gu'],
  [/[\u0B80-\u0BFF]/, 'ta'],
  [/[\u0C00-\u0C7F]/, 'te'],
  [/[\u0C80-\u0CFF]/, 'kn'],
  [/[\u0D00-\u0D7F]/, 'ml'],
  [/[\u0D80-\u0DFF]/, 'si'],
  [/[\u0900-\u097F]/, 'hi'],
  [/[\u10A0-\u10FF]/, 'ka'],
  [/[\u0530-\u058F]/, 'hy'],
  [/[\u1200-\u137F]/, 'am'],
];

/**
 * Lightweight heuristic language detection, used as a fallback / sanity check
 * alongside the model's own detection (and by the offline mock provider).
 */
/** The script of a line, when it is not Latin. Chinese, Japanese, Arabic and the rest. */
export function scriptLanguage(text: string): string | null {
  for (const [re, lang] of SCRIPTS) if (re.test(text)) return lang;
  return null;
}

/** Languages that share a writing system, so Hindi vs Nepali is not a false mismatch. */
const SCRIPT_FAMILY: Record<string, string> = {
  hi: 'devanagari',
  ne: 'devanagari',
  mr: 'devanagari',
  sa: 'devanagari',
};

function sameScriptFamily(a: string, b: string) {
  return !!SCRIPT_FAMILY[a] && SCRIPT_FAMILY[a] === SCRIPT_FAMILY[b];
}

/** A translation into `target` may not arrive in another script. Kanji-only Japanese still counts as Japanese. */
export function translationFitsLanguage(text: string, target: string): boolean {
  const script = scriptLanguage(text);
  if (!script || script === target) return true;
  if (target === 'ja' && script === 'zh') return true;
  if (sameScriptFamily(script, target)) return true;
  return false;
}

/** True when a café draft slipped into another language and should be translated before it is shown. */
export function draftNeedsTranslation(text: string, wanted: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || !wanted) return false;
  if (!translationFitsLanguage(clean, wanted)) return true;
  return detectLanguageHeuristic(clean, wanted) !== wanted;
}

export function detectLanguageHeuristic(text: string, fallback = 'en'): string {
  for (const [re, lang] of SCRIPTS) {
    if (!re.test(text)) continue;
    if (sameScriptFamily(lang, fallback)) return fallback;
    return lang;
  }
  const words = text.toLowerCase().normalize('NFC').match(/[\p{L}']+/gu) ?? [];
  if (!words.length) return fallback;
  let best = fallback;
  let bestScore = 0;
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    const score = words.filter((w) => set.has(w)).length;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

export function normalizeLang(code: string | null | undefined, fallback = 'en'): string {
  const base = (code || '').trim().toLowerCase().split(/[-_]/)[0];
  const c = LANGUAGE_ALIASES[base] ?? base;
  return LANGUAGE_CODES.includes(c) ? c : fallback;
}
