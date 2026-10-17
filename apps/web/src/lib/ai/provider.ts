export type AiTask = 'opener' | 'reply' | 'translate' | 'match' | 'photo_observe' | 'photo_caption' | 'world_reply' | 'cafe_guest';

/** Cultural Café calls this model for everything except translation. Env cannot switch it. */
export const SONNET_MODEL = 'claude-sonnet-5';

/** Translation uses Sonnet unless AI_TRANSLATION_MODEL names another Claude model. */
export const DEFAULT_TRANSLATION_MODEL = SONNET_MODEL;
const CLAUDE_MODEL_ID = /^claude-[a-z0-9][a-z0-9.-]{0,80}$/i;
let warnedTranslationModel = '';

/**
 * The model used for live translation, from the AI_TRANSLATION_MODEL setting.
 * Only Claude model ids are accepted (for example claude-haiku-5-5). Anything else
 * is ignored with a warning, so a typo does not stop translation on the live site.
 */
export function translationModel() {
  const raw = (process.env.AI_TRANSLATION_MODEL || '').trim();
  if (!raw) return { model: DEFAULT_TRANSLATION_MODEL, source: 'default' as const };
  if (CLAUDE_MODEL_ID.test(raw)) return { model: raw, source: 'setting' as const };
  if (warnedTranslationModel !== raw) {
    warnedTranslationModel = raw;
    console.error(`[ai] AI_TRANSLATION_MODEL "${raw}" is not a Claude model id; using ${DEFAULT_TRANSLATION_MODEL}`);
  }
  return { model: DEFAULT_TRANSLATION_MODEL, source: 'invalid' as const, rejected: raw };
}

/** Which model a task runs on. Only translation can be changed. */
export function modelForTask(task: AiTask) {
  return task === 'translate' ? translationModel().model : SONNET_MODEL;
}

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
      model: SONNET_MODEL,
      visionModel: SONNET_MODEL,
      baseUrl: `${neonHost}/v1`,
      isMock: false,
    };
  }

  const requested = (process.env.AI_PROVIDER || '').toLowerCase();
  const apiKey = process.env.AI_API_KEY || '';
  const baseUrl = (process.env.AI_BASE_URL || '').replace(/\/$/, '');
  if (requested === 'openai-compatible' && baseUrl) {
    return {
      provider: 'openai-compatible',
      apiKey,
      model: SONNET_MODEL,
      visionModel: SONNET_MODEL,
      baseUrl,
      isMock: false,
    };
  }
  if (requested === 'anthropic') {
    return {
      provider: 'anthropic',
      apiKey,
      model: SONNET_MODEL,
      visionModel: SONNET_MODEL,
      baseUrl: baseUrl || 'https://api.anthropic.com',
      isMock: false,
    };
  }
  return {
    provider: 'unconfigured',
    apiKey: '',
    model: SONNET_MODEL,
    visionModel: SONNET_MODEL,
    baseUrl: '',
    isMock: false,
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
  const base = cfg.baseUrl.replace(/\/$/, '');
  if (!base || /api\.openai\.com/i.test(base)) {
    throw new AiConfigError('This app only uses Claude Sonnet.');
  }
  const model = modelForTask(req.task);
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
  const model = modelForTask(req.task);
  const data = await postJson(
    `${(cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`,
    { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      system: req.system + (req.json ? '\n\nRespond with a single JSON object only, no prose, no code fences.' : ''),
      max_tokens: req.maxTokens ?? 1200,
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
  if (cfg.model !== SONNET_MODEL || cfg.visionModel !== SONNET_MODEL || cfg.isMock) {
    throw new AiConfigError('This app only uses Claude Sonnet.');
  }
  if (cfg.provider !== 'openai-compatible' && cfg.provider !== 'anthropic') {
    throw new AiConfigError('This app only uses Claude Sonnet. Other models and the offline mock are turned off.');
  }
  if (!cfg.apiKey) {
    throw new AiConfigError('Claude Sonnet is not configured. Set NEON_AI_GATEWAY_TOKEN and NEON_AI_GATEWAY_BASE_URL, or an Anthropic AI_API_KEY.');
  }
  if (cfg.provider === 'openai-compatible') return openAiComplete(req, cfg);
  return anthropicComplete(req, cfg);
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
