import assert from 'node:assert/strict';
import test from 'node:test';
import { AiConfigError, SONNET_MODEL, aiConfig, complete } from './provider';

const KEYS = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_VISION_MODEL', 'AI_BASE_URL', 'NEON_AI_GATEWAY_TOKEN', 'NEON_AI_GATEWAY_BASE_URL'] as const;

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
