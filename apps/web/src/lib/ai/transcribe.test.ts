import assert from 'node:assert/strict';
import test from 'node:test';
import { audioMime, geminiTranscriptText, speechPrompt, transcribeSpeech } from './transcribe';

const KEYS = ['NEON_AI_GATEWAY_TOKEN', 'NEON_AI_GATEWAY_BASE_URL'] as const;
const user = { id: 'u1', email: 'demo@conversa.local', name: 'Demo', role: 'USER', plan: 'FREE' } as const;

function withEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>, fn: () => Promise<void>) {
  const prev = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const key of KEYS) {
      const value = prev[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('a Gemini reply becomes the spoken sentence', () => {
  assert.equal(
    geminiTranscriptText({
      candidates: [{ content: { parts: [{ text: 'The bakery queue is around the corner.' }] } }],
    }),
    'The bakery queue is around the corner.',
  );
  assert.equal(geminiTranscriptText({ candidates: [{ content: { parts: [{ text: 'EMPTY' }] } }] }), '');
  assert.equal(geminiTranscriptText({}), '');
});

test('recorder clips keep a mime Gemini will read', () => {
  assert.equal(audioMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(audioMime('audio/mp4'), 'audio/mp4');
  assert.equal(audioMime(''), 'audio/webm');
});

test('Speak is told the table topic so a near miss can be corrected', () => {
  const prompt = speechPrompt('en', 'What is “Surfing” like where you live?');
  assert.match(prompt, /Surfing/);
  assert.match(prompt, /subject word/);
  assert.match(prompt, /keep their words/);
});

test('Speak auto-corrects a near miss onto the table topic', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.match(body.contents[0].parts[0].text, /Surfing/);
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Serving is what we do on this coast.' }] } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    await withEnv(
      { NEON_AI_GATEWAY_TOKEN: 'nt_test', NEON_AI_GATEWAY_BASE_URL: 'https://branch.example.ai.neon.tech' },
      async () => {
        const file = new File([new Uint8Array(400).fill(1)], 'speech.wav', { type: 'audio/wav' });
        const text = await transcribeSpeech(user, file, 'en', 'What is “Surfing” like where you live?');
        assert.equal(text, 'Surfing is what we do on this coast.');
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Speak sends the clip to Gemini and returns the words', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /gemini-3-1-flash-lite:generateContent$/);
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'audio/wav');
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'The bakery queue is around the corner.' }] } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    await withEnv(
      { NEON_AI_GATEWAY_TOKEN: 'nt_test', NEON_AI_GATEWAY_BASE_URL: 'https://branch.example.ai.neon.tech' },
      async () => {
        const file = new File([new Uint8Array(400).fill(1)], 'speech.wav', { type: 'audio/wav' });
        const text = await transcribeSpeech(user, file, 'en');
        assert.equal(text, 'The bakery queue is around the corner.');
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Speak cannot guess words when the gateway is missing', async () => {
  await withEnv({ NEON_AI_GATEWAY_TOKEN: undefined, NEON_AI_GATEWAY_BASE_URL: undefined }, async () => {
    const file = new File([new Uint8Array(400).fill(1)], 'speech.webm', { type: 'audio/webm' });
    await assert.rejects(() => transcribeSpeech(user, file, 'en'), /Could not hear that line/);
  });
});

test('a dropped speech call is a spoken error, not an internal crash', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  try {
    await withEnv(
      { NEON_AI_GATEWAY_TOKEN: 'nt_test', NEON_AI_GATEWAY_BASE_URL: 'https://branch.example.ai.neon.tech' },
      async () => {
        const file = new File([new Uint8Array(400).fill(1)], 'speech.webm', { type: 'audio/webm' });
        await assert.rejects(() => transcribeSpeech(user, file, 'en'), /speech service|VPN/i);
        assert.equal(calls, 2);
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Speak still works if the first speech call drops', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'The night train is slow.' }] } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    await withEnv(
      { NEON_AI_GATEWAY_TOKEN: 'nt_test', NEON_AI_GATEWAY_BASE_URL: 'https://branch.example.ai.neon.tech' },
      async () => {
        const file = new File([new Uint8Array(400).fill(1)], 'speech.webm', { type: 'audio/webm' });
        assert.equal(await transcribeSpeech(user, file, 'en'), 'The night train is slow.');
        assert.equal(calls, 2);
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});
