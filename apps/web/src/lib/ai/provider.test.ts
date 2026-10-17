import assert from 'node:assert/strict';
import test from 'node:test';
import { AiConfigError, DEFAULT_TRANSLATION_MODEL, SONNET_MODEL, aiConfig, complete, modelForTask, translationModel } from './provider';

const KEYS = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_VISION_MODEL', 'AI_BASE_URL', 'AI_TRANSLATION_MODEL', 'NEON_AI_GATEWAY_TOKEN', 'NEON_AI_GATEWAY_BASE_URL'] as const;

function withEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>, fn: () => void | Promise<void>) {
  const prev = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const done = () => {
    for (const key of KEYS) {
      const value = prev[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      return (result as Promise<void>).finally(done);
    }
    done();
  } catch (err) {
    done();
    throw err;
  }
}

const sample = {
  task: 'world_reply' as const,
  system: 'Reply as a person.',
  messages: [{ role: 'user' as const, content: 'The bakery stopped me.' }],
  json: true,
};

test('gpt and the offline mock cannot select the model', () => {
  withEnv(
    { AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4o-mini', AI_VISION_MODEL: 'gpt-4o', AI_API_KEY: 'sk-test' },
    () => {
      const cfg = aiConfig();
      assert.equal(cfg.model, SONNET_MODEL);
      assert.equal(cfg.visionModel, SONNET_MODEL);
      assert.equal(cfg.isMock, false);
      assert.equal(cfg.provider, 'unconfigured');
    },
  );
  withEnv({ AI_PROVIDER: 'mock', AI_MODEL: 'gpt-4o-mini' }, () => {
    const cfg = aiConfig();
    assert.equal(cfg.model, 'claude-sonnet-5');
    assert.equal(cfg.provider, 'unconfigured');
  });
});

test('the neon gateway still calls Claude Sonnet', () => {
  withEnv(
    {
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-5-mini',
      NEON_AI_GATEWAY_TOKEN: 'nt_test',
      NEON_AI_GATEWAY_BASE_URL: 'https://branch.example.ai.neon.tech',
    },
    () => {
      const cfg = aiConfig();
      assert.equal(cfg.model, SONNET_MODEL);
      assert.equal(cfg.provider, 'openai-compatible');
      assert.equal(cfg.baseUrl, 'https://branch.example.ai.neon.tech/v1');
    },
  );
});

test('a non-Sonnet provider is refused before any request', async () => {
  await withEnv({ AI_PROVIDER: 'mock', AI_MODEL: 'gpt-4o-mini', AI_API_KEY: 'sk-test' }, async () => {
    await assert.rejects(() => complete(sample), (err: unknown) => {
      assert.ok(err instanceof AiConfigError);
      assert.match(err.message, /only uses Claude Sonnet/);
      return true;
    });
  });
});

test('translation uses Sonnet until AI_TRANSLATION_MODEL is set', () => {
  withEnv({}, () => {
    assert.equal(DEFAULT_TRANSLATION_MODEL, SONNET_MODEL);
    assert.deepEqual(translationModel(), { model: SONNET_MODEL, source: 'default' });
    assert.equal(modelForTask('translate'), SONNET_MODEL);
  });
});

test('AI_TRANSLATION_MODEL changes translation only', () => {
  withEnv({ AI_TRANSLATION_MODEL: ' claude-haiku-5-5 ' }, () => {
    assert.deepEqual(translationModel(), { model: 'claude-haiku-5-5', source: 'setting' });
    assert.equal(modelForTask('translate'), 'claude-haiku-5-5');
    assert.equal(modelForTask('world_reply'), SONNET_MODEL);
    assert.equal(modelForTask('cafe_guest'), SONNET_MODEL);
    assert.equal(aiConfig().model, SONNET_MODEL);
  });
});

test('a non-Claude translation model is ignored, not used', () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (msg: string) => errors.push(String(msg));
  try {
    for (const bad of ['gpt-4o-mini', 'claude', 'claude-x; rm -rf /', 'mock']) {
      withEnv({ AI_TRANSLATION_MODEL: bad }, () => {
        const picked = translationModel();
        assert.equal(picked.model, SONNET_MODEL, bad);
        assert.equal(picked.source, 'invalid', bad);
        assert.equal(modelForTask('translate'), SONNET_MODEL, bad);
      });
    }
  } finally {
    console.error = original;
  }
  assert.ok(errors.some((e) => e.includes('gpt-4o-mini')));
});

test('the chosen translation model is the one sent to the API', async () => {
  const sent: { url: string; model: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    sent.push({ url: String(url), model: JSON.parse(init.body).model });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 1, output_tokens: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await withEnv({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-ant-test', AI_TRANSLATION_MODEL: 'claude-haiku-5-5' }, async () => {
      const translated = await complete({ ...sample, task: 'translate' });
      const replied = await complete(sample);
      assert.equal(translated.model, 'claude-haiku-5-5');
      assert.equal(replied.model, SONNET_MODEL);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(sent.map((s) => s.model), ['claude-haiku-5-5', SONNET_MODEL]);
  assert.ok(sent.every((s) => s.url.endsWith('/v1/messages')));
});
