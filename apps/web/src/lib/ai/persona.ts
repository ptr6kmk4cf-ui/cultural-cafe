import { LEVEL_LABELS, STYLES, languageName } from '@conversa/shared';
import { db } from '../db';
import { decrypt } from '../crypto';
import { ageFromBirthDate } from '../auth';

export interface Persona {
  displayName: string;
  age: number;
  aboutMe: string;
  interests: string[];
  intentions: string;
  personality: string;
  style: string;
  humorLevel: number;
  flirtingLevel: number;
  formality: number;
  messageLength: string;
  useEmojis: boolean;
  topicsToAvoid: string[];
  boundaries: string;
  grammaticalGender: string;
}

export interface LanguagePrefs {
  myLanguage: string;
  defaultReplyLanguage: string;
  defaultMode: 'SELECTED' | 'AUTO' | 'TRANSLATE';
}

export async function loadPersona(userId: string): Promise<{ persona: Persona; lang: LanguagePrefs }> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { personality: true, language: true },
  });
  const p = user.personality;
  return {
    persona: {
      displayName: p?.displayName || user.name,
      age: ageFromBirthDate(user.birthDate),
      aboutMe: decrypt(p?.aboutMe),
      interests: p?.interests ?? [],
      intentions: p?.intentions ?? '',
      personality: p?.personality ?? '',
      style: p?.style ?? 'natural',
      humorLevel: p?.humorLevel ?? 2,
      flirtingLevel: p?.flirtingLevel ?? 1,
      formality: p?.formality ?? 1,
      messageLength: p?.messageLength ?? 'medium',
      useEmojis: p?.useEmojis ?? true,
      topicsToAvoid: p?.topicsToAvoid ?? [],
      boundaries: decrypt(p?.boundaries),
      grammaticalGender: p?.grammaticalGender ?? 'unspecified',
    },
    lang: {
      myLanguage: user.language?.myLanguage ?? 'en',
      defaultReplyLanguage: user.language?.defaultReplyLanguage ?? 'en',
      defaultMode: user.language?.defaultMode ?? 'AUTO',
    },
  };
}

const LENGTH_GUIDE: Record<string, string> = {
  short: '1–2 short sentences (under ~25 words)',
  medium: '2–3 sentences (~25–50 words)',
  long: '3–5 sentences (~50–90 words)',
};

export function personaBlock(p: Persona, styleOverride?: string | null): string {
  const style = STYLES.find((s) => s.value === (styleOverride || p.style)) ?? STYLES[0];
  return `
ABOUT THE USER (the only facts you may state about them; the user is an adult)
- First name: ${p.displayName}
- Age: ${p.age}
- About: ${p.aboutMe || '(nothing provided — do not invent anything)'}
- Interests: ${p.interests.join(', ') || '(none provided)'}
- Dating intentions: ${p.intentions || '(not specified)'}
- Personality (self-described): ${p.personality || '(not specified)'}

VOICE TO WRITE IN
- Style: ${style.label} — ${style.help}
- Humor: ${p.humorLevel}/4 (${LEVEL_LABELS.humor[p.humorLevel] ?? ''})
- Flirting: ${p.flirtingLevel}/4 (${LEVEL_LABELS.flirting[p.flirtingLevel] ?? ''}) — always respectful
- Formality: ${LEVEL_LABELS.formality[p.formality] ?? 'Casual'}
- Length: ${LENGTH_GUIDE[p.messageLength] ?? LENGTH_GUIDE.medium}
- Emojis: ${p.useEmojis ? 'allowed, at most one per message' : 'none'}
- Topics to avoid: ${p.topicsToAvoid.join(', ') || '(none)'}
- Personal boundaries: ${p.boundaries || '(none specified)'}
`.trim();
}

/** Grammar rule for the user's self-references; placed among the writing rules, where small models respect it. */
export function genderRule(p: Persona): string {
  switch (p.grammaticalGender) {
    case 'feminine':
      return `GRAMMAR (mandatory): the user is a woman. Whenever the user refers to herself in a gendered language, use FEMININE agreement — adjectives, participles, nouns and job titles (fr "je suis contente / fatiguée / ingénieure", es "estoy cansada", it "sono stanca", pt "estou cansada", ar "أنا متعبة / أنا مهندسة"). Check every suggestion before answering.`;
    case 'masculine':
      return `GRAMMAR (mandatory): the user is a man. Whenever the user refers to himself in a gendered language, use MASCULINE agreement (fr "je suis content / fatigué / ingénieur", es "estoy cansado", it "sono stanco", pt "estou cansado", ar "أنا متعب / أنا مهندس").`;
    case 'neutral':
      return 'GRAMMAR (mandatory): the user prefers gender-neutral self-reference. In gendered languages, rephrase so no gendered agreement for the user is needed (fr "ça me rend heureux·se" → "ça me fait plaisir"; "je suis ingénieur" → "je travaille dans l\'ingénierie").';
    default:
      return 'GRAMMAR: the user\'s gender is not known. In gendered languages, phrase self-references so they need no gendered agreement (fr "je ne peux pas" rather than "je suis désolée"; "je travaille comme développeur" → "je travaille dans le développement logiciel").';
  }
}

export function langLine(code: string) {
  return `${languageName(code)} (${code})`;
}
