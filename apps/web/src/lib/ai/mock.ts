import type { AiRequest, AiResult } from './provider';
import { detectLanguageHeuristic } from './lang';
import { detectStopRequest } from './safety';

/**
 * OFFLINE MOCK PROVIDER — NOT REAL AI.
 * Returns deterministic, schema-valid output so the full pipeline (API, DB,
 * extension, autopilot) can be exercised without an API key. Every generated
 * message is prefixed with "[Mock AI]" and the UI shows a warning banner.
 */

function textOf(req: AiRequest): string {
  return req.messages
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n')))
    .join('\n');
}

function between(text: string, tag: string): string {
  const m = text.match(new RegExp(`<untrusted_${tag}>\\n?([\\s\\S]*?)\\n?</untrusted_${tag}>`));
  return m ? m[1].trim() : '';
}

const PHRASES: Record<string, { hi: string; reply: string; follow: string; bye: string; q: string }> = {
  en: { hi: 'Hi', reply: 'That sounds great!', follow: 'Tell me more?', bye: 'Thanks for letting me know — take care!', q: 'What got you into' },
  fr: { hi: 'Salut', reply: 'Ça a l’air génial !', follow: 'Tu m’en dis plus ?', bye: 'Merci de me l’avoir dit, prends soin de toi !', q: 'Qu’est-ce qui t’a donné envie de' },
  es: { hi: 'Hola', reply: '¡Suena genial!', follow: '¿Me cuentas más?', bye: 'Gracias por decírmelo, ¡cuídate!', q: '¿Qué te llevó a' },
  de: { hi: 'Hallo', reply: 'Das klingt toll!', follow: 'Erzählst du mir mehr?', bye: 'Danke, dass du es mir sagst – alles Gute!', q: 'Wie bist du zu' },
  it: { hi: 'Ciao', reply: 'Sembra fantastico!', follow: 'Mi racconti di più?', bye: 'Grazie per avermelo detto, stammi bene!', q: 'Cosa ti ha avvicinato a' },
  pt: { hi: 'Olá', reply: 'Parece ótimo!', follow: 'Conta-me mais?', bye: 'Obrigado por me dizeres, cuida-te!', q: 'O que te levou a' },
  nl: { hi: 'Hoi', reply: 'Dat klinkt geweldig!', follow: 'Vertel je meer?', bye: 'Bedankt dat je het zegt, het ga je goed!', q: 'Hoe ben je begonnen met' },
  ar: { hi: 'مرحبا', reply: 'يبدو ذلك رائعاً!', follow: 'هل تخبرني المزيد؟', bye: 'شكراً لإخباري، اعتنِ بنفسك!', q: 'ما الذي جذبك إلى' },
  ja: { hi: 'こんにちは', reply: 'それはいいですね。', follow: 'もう少し聞かせてください。', bye: 'わかりました。気をつけて。', q: 'きっかけは' },
  sw: { hi: 'Habari', reply: 'Hiyo ni nzuri.', follow: 'Niambie zaidi.', bye: 'Sawa. Jitunze.', q: 'Nini kilikufanya uanze' },
};

function targetLang(system: string, fallbackText: string): string {
  const only = system.match(/Write (?:ONLY|every suggestion) in [^(]+\((\w\w)\)/);
  if (only) return only[1];
  return detectLanguageHeuristic(fallbackText, (system.match(/fallback:? [^(]+\((\w\w)\)/) || [])[1] || 'en');
}

export async function mockComplete(req: AiRequest): Promise<AiResult> {
  const text = textOf(req);
  let out: unknown;

  switch (req.task) {
    case 'opener': {
      const profile = between(text, 'profile');
      const name = profile.match(/Name: (.*)/)?.[1]?.trim() ?? 'there';
      const interests = (profile.match(/Interests: (.*)/)?.[1] ?? 'your profile').split(',').map((s) => s.trim());
      const lang = targetLang(req.system, '');
      const p = PHRASES[lang] ?? PHRASES.en;
      out = {
        openers: interests.slice(0, 3).concat(['your bio', 'your photos', 'your profile']).slice(0, 3).map((i, n) => ({
          text: `[Mock AI] ${p.hi} ${name}! ${n === 0 ? `${p.q} ${i}?` : n === 1 ? `${i} — ${p.follow}` : `${p.reply} ${i}. ${p.follow}`}`,
          hook: i,
        })),
        needsUserInput: null,
      };
      break;
    }
    case 'reply': {
      const latest = between(text, 'latest_message');
      const lang = targetLang(req.system, latest);
      const detected = latest ? detectLanguageHeuristic(latest) : lang;
      const p = PHRASES[lang] ?? PHRASES.en;
      const stop = latest ? detectStopRequest(latest) : false;
      const myLang = req.system.match(/The user reads [^(]+\((\w\w)\)/)?.[1] ?? 'en';
      const autopilot = /Provide 1 suggestion/.test(req.system);
      const photosJson = req.system.match(/APPROVED PHOTOS: (\[.*\])/)?.[1];
      const photos: { id: string; caption: string; tags: string[] }[] = photosJson ? JSON.parse(photosJson) : [];
      const words = latest.toLowerCase();
      const photo = photos.find((ph) => ph.tags.some((t) => t && words.includes(t.toLowerCase())));
      const base = stop ? [p.bye] : [`${p.reply} ${p.follow}`, `${p.reply} 😊`, p.follow];
      out = {
        detectedLanguage: detected,
        incomingTranslation: latest && detected !== myLang ? `[Mock translation to ${myLang}] ${latest}` : null,
        suggestions: base.slice(0, autopilot ? 1 : 3).map((s) => ({
          text: `[Mock AI] ${s}`,
          translation: lang !== myLang ? `[Mock translation to ${myLang}] ${s}` : null,
        })),
        intent: {
          interestLevel: stop ? 'low' : 'medium',
          rejection: stop,
          stopRequested: stop,
          meetingAppropriate: false,
          needsHuman: false,
          needsHumanReason: null,
        },
        needsUserInput: null,
        memory: latest && !stop ? [{ kind: 'TOPIC', content: `Mentioned: ${latest.slice(0, 80)}` }] : [],
        answeredQuestions: [],
        photo: photo && !stop ? { photoId: photo.id, caption: `[Mock AI] ${photo.caption}`, reason: 'Tag matched the message' } : null,
      };
      break;
    }
    case 'translate': {
      const src = between(text, 'text');
      const target = req.system.match(/into [^(]+\((\w\w)\)/)?.[1] ?? 'en';
      out = { translation: `[Mock translation to ${target}] ${src}`, detectedLanguage: detectLanguageHeuristic(src) };
      break;
    }
    case 'cafe_guest': {
      const latest = between(text, 'latest');
      const stop = latest ? detectStopRequest(latest) : false;
      const sensitive = latest ? /western union|money|iban/i.test(latest) : false;
      const lang = (req.system.match(/Write ONLY in [^(]+\((\w\w)\)/) || [])[1] || 'en';
      const p = PHRASES[lang] ?? PHRASES.en;
      out = { text: stop || sensitive ? p.bye : latest ? `${p.reply} ${p.follow}` : p.hi };
      break;
    }
    case 'world_reply': {
      const latest = between(text, 'latest_message');
      const stop = latest ? detectStopRequest(latest) : false;
      const sensitive = /western union|money|iban/i.test(latest);
      const lang = (req.system.match(/Write ONLY in [^(]+\((\w\w)\)/) || [])[1] || 'en';
      const p = PHRASES[lang] ?? PHRASES.en;
      const steps = [
        'In my city the morning is the street waking up. What is morning like where you are?',
        'On a normal Sunday I stay close to home. What do people do on Sunday there?',
        'The market is where I hear the city. What do you hear at yours?',
        'Rain changes the street here. People slow down. Does the weather change your day?',
      ];
      const next = steps.find((step) => !text.includes(step));
      const line = stop || sensitive || !next ? p.bye : next;
      out = {
        text: line,
        hold: stop || sensitive || !next,
        holdReason: stop ? 'They asked to stop.' : sensitive ? 'Money or private details.' : !next ? 'The lines for this table are used up.' : null,
      };
      break;
    }
    case 'match': {
      const wanted = (req.system.match(/- Interests: (.*)/)?.[1] ?? '')
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== 'any');
      const blocks = [...text.matchAll(/<untrusted_profile>\n?([\s\S]*?)\n?<\/untrusted_profile>/g)];
      out = {
        results: blocks.map((b) => {
          const p = JSON.parse(b[1]);
          const shared = (p.interests as string[]).filter((i) => wanted.some((w) => i.toLowerCase().includes(w)));
          const score = Math.min(95, 40 + shared.length * 18);
          return {
            externalId: p.externalId,
            score,
            recommended: score >= 60,
            reasons: shared.length ? [`[Mock AI] Shared interests: ${shared.join(', ')}`] : ['[Mock AI] Few overlapping interests'],
            cautions: /ignore (all )?previous instructions/i.test(p.bio) ? ['Profile contains instructions aimed at AI tools (ignored)'] : [],
            photoObservations: [],
          };
        }),
      };
      break;
    }
    default:
      out = {};
  }

  await new Promise((r) => setTimeout(r, 150));
  return { text: JSON.stringify(out), provider: 'mock', model: 'mock-offline', inputTokens: 0, outputTokens: 0 };
}
