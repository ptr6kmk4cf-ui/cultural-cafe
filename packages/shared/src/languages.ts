export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
  /** AI output quality is noticeably weaker (low-resource language). */
  beta?: boolean;
}

type Row = [code: string, name: string, nativeName: string, flags?: 'rtl' | 'beta' | 'rtl beta'];

// ISO 639-1 codes only: the AI returns detected languages as two-letter codes.
const ROWS: Row[] = [
  ['af', 'Afrikaans', 'Afrikaans'],
  ['sq', 'Albanian', 'Shqip'],
  ['am', 'Amharic', 'አማርኛ', 'beta'],
  ['ar', 'Arabic', 'العربية', 'rtl'],
  ['hy', 'Armenian', 'Հայերեն'],
  ['az', 'Azerbaijani', 'Azərbaycanca'],
  ['eu', 'Basque', 'Euskara'],
  ['be', 'Belarusian', 'Беларуская'],
  ['bn', 'Bengali', 'বাংলা'],
  ['bs', 'Bosnian', 'Bosanski'],
  ['bg', 'Bulgarian', 'Български'],
  ['my', 'Burmese', 'မြန်မာ', 'beta'],
  ['ca', 'Catalan', 'Català'],
  ['zh', 'Chinese', '中文'],
  ['hr', 'Croatian', 'Hrvatski'],
  ['cs', 'Czech', 'Čeština'],
  ['da', 'Danish', 'Dansk'],
  ['nl', 'Dutch', 'Nederlands'],
  ['en', 'English', 'English'],
  ['et', 'Estonian', 'Eesti'],
  ['tl', 'Filipino', 'Filipino'],
  ['fi', 'Finnish', 'Suomi'],
  ['fr', 'French', 'Français'],
  ['gl', 'Galician', 'Galego'],
  ['ka', 'Georgian', 'ქართული'],
  ['de', 'German', 'Deutsch'],
  ['el', 'Greek', 'Ελληνικά'],
  ['gu', 'Gujarati', 'ગુજરાતી'],
  ['ht', 'Haitian Creole', 'Kreyòl ayisyen', 'beta'],
  ['ha', 'Hausa', 'Hausa', 'beta'],
  ['he', 'Hebrew', 'עברית', 'rtl'],
  ['hi', 'Hindi', 'हिन्दी'],
  ['hu', 'Hungarian', 'Magyar'],
  ['is', 'Icelandic', 'Íslenska'],
  ['ig', 'Igbo', 'Igbo', 'beta'],
  ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['ga', 'Irish', 'Gaeilge'],
  ['it', 'Italian', 'Italiano'],
  ['ja', 'Japanese', '日本語'],
  ['jv', 'Javanese', 'Basa Jawa', 'beta'],
  ['kn', 'Kannada', 'ಕನ್ನಡ'],
  ['kk', 'Kazakh', 'Қазақ тілі'],
  ['km', 'Khmer', 'ខ្មែរ', 'beta'],
  ['ko', 'Korean', '한국어'],
  ['ku', 'Kurdish', 'Kurdî', 'beta'],
  ['ky', 'Kyrgyz', 'Кыргызча', 'beta'],
  ['lo', 'Lao', 'ລາວ', 'beta'],
  ['lv', 'Latvian', 'Latviešu'],
  ['lt', 'Lithuanian', 'Lietuvių'],
  ['lb', 'Luxembourgish', 'Lëtzebuergesch'],
  ['mk', 'Macedonian', 'Македонски'],
  ['mg', 'Malagasy', 'Malagasy', 'beta'],
  ['ms', 'Malay', 'Bahasa Melayu'],
  ['ml', 'Malayalam', 'മലയാളം'],
  ['mt', 'Maltese', 'Malti'],
  ['mi', 'Māori', 'Te Reo Māori', 'beta'],
  ['mr', 'Marathi', 'मराठी'],
  ['mn', 'Mongolian', 'Монгол'],
  ['ne', 'Nepali', 'नेपाली'],
  ['no', 'Norwegian', 'Norsk'],
  ['ps', 'Pashto', 'پښتو', 'rtl beta'],
  ['fa', 'Persian', 'فارسی', 'rtl'],
  ['pl', 'Polish', 'Polski'],
  ['pt', 'Portuguese', 'Português'],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['ro', 'Romanian', 'Română'],
  ['ru', 'Russian', 'Русский'],
  ['sr', 'Serbian', 'Српски'],
  ['si', 'Sinhala', 'සිංහල', 'beta'],
  ['sk', 'Slovak', 'Slovenčina'],
  ['sl', 'Slovenian', 'Slovenščina'],
  ['so', 'Somali', 'Soomaali', 'beta'],
  ['es', 'Spanish', 'Español'],
  ['sw', 'Swahili', 'Kiswahili'],
  ['sv', 'Swedish', 'Svenska'],
  ['tg', 'Tajik', 'Тоҷикӣ', 'beta'],
  ['ta', 'Tamil', 'தமிழ்'],
  ['te', 'Telugu', 'తెలుగు'],
  ['th', 'Thai', 'ไทย'],
  ['tr', 'Turkish', 'Türkçe'],
  ['uk', 'Ukrainian', 'Українська'],
  ['ur', 'Urdu', 'اردو', 'rtl'],
  ['uz', 'Uzbek', 'Oʻzbekcha'],
  ['vi', 'Vietnamese', 'Tiếng Việt'],
  ['cy', 'Welsh', 'Cymraeg'],
  ['xh', 'Xhosa', 'isiXhosa', 'beta'],
  ['yi', 'Yiddish', 'ייִדיש', 'rtl beta'],
  ['yo', 'Yoruba', 'Yorùbá', 'beta'],
  ['zu', 'Zulu', 'isiZulu', 'beta'],
];

export const LANGUAGES: LanguageInfo[] = ROWS.map(([code, name, nativeName, flags = '']) => ({
  code,
  name,
  nativeName,
  rtl: flags.includes('rtl'),
  ...(flags.includes('beta') ? { beta: true } : {}),
}));

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];

/** Codes the AI or browsers sometimes use instead of ours. */
export const LANGUAGE_ALIASES: Record<string, string> = { fil: 'tl', iw: 'he', ji: 'yi', jw: 'jv', nb: 'no', nn: 'no', in: 'id', zho: 'zh', cmn: 'zh', yue: 'zh' };

export const MAX_PREFERRED_LANGUAGES = 20;

export function languageInfo(code: string | null | undefined): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function languageName(code: string | null | undefined): string {
  return languageInfo(code)?.name ?? 'English';
}

export function isRtl(code: string | null | undefined): boolean {
  return languageInfo(code)?.rtl ?? false;
}

/** The user's chosen languages first (in their order), then every other language A–Z. */
export function orderLanguages(preferred: string[] = []): { mine: LanguageInfo[]; others: LanguageInfo[] } {
  const mine = preferred.map(languageInfo).filter((l): l is LanguageInfo => !!l);
  const set = new Set(mine.map((l) => l.code));
  return { mine, others: LANGUAGES.filter((l) => !set.has(l.code)) };
}

export type LanguageModeValue = 'SELECTED' | 'AUTO' | 'TRANSLATE';

export const LANGUAGE_MODES: { value: LanguageModeValue; label: string; help: string }[] = [
  { value: 'SELECTED', label: 'Selected language', help: 'Always write in the chosen language.' },
  { value: 'AUTO', label: 'Auto detect', help: 'Reply in whatever language the contact writes in.' },
  {
    value: 'TRANSLATE',
    label: 'Translate & reply',
    help: "Show incoming messages in your language, write replies in the contact's language.",
  },
];
