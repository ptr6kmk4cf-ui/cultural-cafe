import { languageName } from '@conversa/shared';
import type { AuthUser } from '../auth';
import { HttpError } from '../http';
import { sanitizeUntrusted } from './safety';
import { correctSpokenLine } from '../table-reply';

const GEMINI_STT = 'gemini-3-1-flash-lite';

/** Gemini reads webm/mp4 from the recorder; drop codec suffixes. */
export function audioMime(type: string) {
  const raw = (type || '').split(';')[0].trim().toLowerCase();
  if (raw.startsWith('audio/webm')) return 'audio/webm';
  if (raw.startsWith('audio/mp4') || raw === 'video/mp4') return 'audio/mp4';
  if (raw.startsWith('audio/ogg')) return 'audio/ogg';
  if (raw === 'audio/wav' || raw === 'audio/wave' || raw === 'audio/x-wav') return 'audio/wav';
  return raw || 'audio/webm';
}

/** Pulls the spoken sentence out of a Gemini generateContent body. */
export function geminiTranscriptText(data: unknown) {
  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]
    ?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((part) => part?.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  const clean = text.replace(/^["“]+|["”]+$/g, '').trim();
  if (!clean || /^empty$/i.test(clean)) return '';
  return clean;
}

const STT_NETWORK =
  'Could not reach the speech service. Turn off VPN if it is on, stay online, then tap Speak again.';

async function postSpeech(url: string, token: string, body: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      /* VPN and slow links drop the first try; Speak tries again. */
    }
  }
  throw new HttpError(503, STT_NETWORK, 'stt_network');
}

/** Tells speech-to-text the table subject so near-miss words land on the topic. */
export function speechPrompt(language: string, topic: string) {
  const lang = language.trim();
  const named = lang ? languageName(lang) : '';
  const langHint = named
    ? ` The speaker is using ${named}. Write the transcript in ${named} only. Do not translate the words into English or any other language.`
    : '';
  const subject = sanitizeUntrusted(topic, 300);
  const topicHint = subject
    ? ` The café table is about: ${subject}. When a spoken word sounds like a word from that subject, write the subject word. Write only the sentence they spoke. Do not invent a new on-topic line. If they clearly left the subject, keep their words.`
    : '';
  return `Transcribe the spoken words only.${langHint}${topicHint} Return plain text with no quotes or commentary. If there are no words, return EMPTY.`;
}

/** Turns a spoken clip into the words the person said, auto-corrected to the table topic. */
export async function transcribeSpeech(_user: AuthUser, file: File, language: string, topic = '') {
  const token = process.env.NEON_AI_GATEWAY_TOKEN || '';
  const host = (process.env.NEON_AI_GATEWAY_BASE_URL || '').replace(/\/$/, '');
  if (!token || !host) {
    throw new HttpError(503, 'Could not hear that line. Tap Speak again.', 'stt');
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength < 200) {
    throw new HttpError(422, 'No words were heard. Tap Speak and try again.', 'empty');
  }
  const res = await postSpeech(
    `${host}/gemini/v1beta/models/${GEMINI_STT}:generateContent`,
    token,
    JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: speechPrompt(language, topic) },
            { inlineData: { mimeType: audioMime(file.type), data: buf.toString('base64') } },
          ],
        },
      ],
    }),
  );
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new HttpError(503, STT_NETWORK, 'stt');
  }
  const text = geminiTranscriptText(data);
  if (!text) throw new HttpError(422, 'No words were heard. Tap Speak and try again.', 'empty');
  return correctSpokenLine(text, topic);
}
