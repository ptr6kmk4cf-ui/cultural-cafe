import { mockComplete } from './mock';

export type AiTask = 'opener' | 'reply' | 'translate' | 'match' | 'photo_observe' | 'photo_caption' | 'world_reply' | 'cafe_guest';

export type AiPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string | AiPart[];
}

export interface AiRequest {
  task: AiTask;
  system: string;
  messages: AiMessage[];
  /** Ask the provider for a single JSON object. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  vision?: boolean;
}

export interface AiResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiConfigError extends Error {}

export function aiConfig() {
  const neonToken = process.env.NEON_AI_GATEWAY_TOKEN || '';
  const neonHost = (process.env.NEON_AI_GATEWAY_BASE_URL || '').replace(/\/$/, '');
  if (neonToken && neonHost) {
    return {
      provider: 'openai-compatible',
      apiKey: neonToken,
      model: process.env.AI_MODEL || 'claude-haiku-4-5',
      visionModel: process.env.AI_VISION_MODEL || '',
      baseUrl: `${neonHost}/v1`,
      isMock: false,
    };
  }

  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  return {
    provider,
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || (provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'),
    visionModel: process.env.AI_VISION_MODEL || '',
    baseUrl: process.env.AI_BASE_URL || '',
    isMock: provider === 'mock',
  };
}

const TIMEOUT_MS = 60_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || res.statusText;
      throw new Error(`AI provider error ${res.status}: ${msg}`);
    }
    return data as Record<string, any>;
  } finally {
    clearTimeout(t);
  }
}

function asCompletion(data: Record<string, any>, provider: string, model: string): AiResult {
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    provider,
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

/** Claude on the Neon gateway rejects OpenAI json mode and sometimes temperature. */
function claudeModel(model: string) {
  return /claude/i.test(model);
}

async function openAiComplete(req: AiRequest, cfg: ReturnType<typeof aiConfig>): Promise<AiResult> {
  const base = (cfg.provider === 'openai-compatible' ? cfg.baseUrl : cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  if (!base) throw new AiConfigError('AI_BASE_URL is required for openai-compatible providers');
  const model = req.vision && cfg.visionModel ? cfg.visionModel : cfg.model;
  const claude = claudeModel(model);
  const messages = [
    {
      role: 'system',
      content:
        req.system +
        (req.json && claude ? '\n\nRespond with a single JSON object only, no prose, no code fences.' : ''),
    },
    ...req.messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((p) =>
              p.type === 'text'
                ? { type: 'text', text: p.text }
                : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}`, detail: 'low' } },
            ),
    })),
  ];
  const url = `${base}/chat/completions`;
  const headers: Record<string, string> = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: req.maxTokens ?? 1200,
  };
  if (!claude) body.temperature = req.temperature ?? 0.8;
  if (req.json && !claude) body.response_format = { type: 'json_object' };
  try {
    return asCompletion(await postJson(url, headers, body), cfg.provider, model);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('AI provider error 400:')) throw err;
    const plain = messages.map((m, i) =>
      i === 0 && req.json && typeof m.content === 'string' && !m.content.includes('single JSON object')
        ? { ...m, content: `${m.content}\n\nRespond with a single JSON object only, no prose, no code fences.` }
        : m,
    );
    const retry: Record<string, unknown> = {
      model,
      messages: plain,
      max_tokens: req.maxTokens ?? 1200,
    };
    return asCompletion(await postJson(url, headers, retry), cfg.provider, model);
  }
}

async function anthropicComplete(req: AiRequest, cfg: ReturnType<typeof aiConfig>): Promise<AiResult> {
  const model = req.vision && cfg.visionModel ? cfg.visionModel : cfg.model;
  const data = await postJson(
    `${(cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`,
    { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      system: req.system + (req.json ? '\n\nRespond with a single JSON object only, no prose, no code fences.' : ''),
      max_tokens: req.maxTokens ?? 1200,
      temperature: req.temperature ?? 0.8,
      messages: req.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content.map((p) =>
                p.type === 'text'
                  ? { type: 'text', text: p.text }
                  : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } },
              ),
      })),
    },
  );
  const text = (data.content ?? [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
    .join('');
  return {
    text,
    provider: 'anthropic',
    model,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

export async function complete(req: AiRequest): Promise<AiResult> {
  const cfg = aiConfig();
  if (cfg.isMock) return mockComplete(req);
  if (!cfg.apiKey && cfg.provider !== 'openai-compatible') {
    throw new AiConfigError('AI is not configured: set AI_API_KEY (and AI_PROVIDER / AI_MODEL) in apps/web/.env');
  }
  switch (cfg.provider) {
    case 'openai':
    case 'openai-compatible':
      return openAiComplete(req, cfg);
    case 'anthropic':
      return anthropicComplete(req, cfg);
    default:
      throw new AiConfigError(`Unknown AI_PROVIDER "${cfg.provider}"`);
  }
}

/** Extracts the first JSON object from model output (tolerates code fences / stray prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in AI output');
  return JSON.parse(candidate.slice(start, end + 1));
}
