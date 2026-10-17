import type { ZodType, ZodTypeDef } from 'zod';
import type { AuthUser } from '../auth';
import { db } from '../db';
import { HttpError } from '../http';
import { assertAiQuota } from '../plans';
import { AiConfigError, aiConfig, complete, extractJson, modelForTask, type AiRequest } from './provider';

/**
 * Runs an AI task for a user: quota check → provider call → JSON validation
 * (one retry on malformed output) → usage logging.
 */
export async function runAi<T>(user: AuthUser, req: AiRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<{ data: T; mock: boolean }> {
  await assertAiQuota(user.id, user.plan);
  const cfg = aiConfig();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await complete(
        attempt === 0
          ? req
          : {
              ...req,
              messages: [
                ...req.messages,
                { role: 'user', content: 'Your previous answer was not valid JSON for the required schema. Return only the JSON object.' },
              ],
            },
      );
      const parsed = schema.parse(extractJson(result.text));
      await db.aiUsage.create({
        data: {
          userId: user.id,
          feature: req.task,
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
      return { data: parsed, mock: cfg.isMock };
    } catch (err) {
      lastErr = err;
      if (err instanceof AiConfigError) throw new HttpError(503, err.message, 'ai_not_configured');
      const providerErr = classifyProviderError(err);
      if (providerErr) {
        await logFailure(user.id, req.task, cfg.provider, modelForTask(req.task));
        console.error('[ai] provider error', req.task, (err as Error).message);
        throw providerErr;
      }
    }
  }
  await logFailure(user.id, req.task, cfg.provider, modelForTask(req.task));
  console.error('[ai] task failed', req.task, lastErr);
  throw new HttpError(502, 'The AI service returned an unusable answer. Please try again.', 'ai_failed');
}

function logFailure(userId: string, feature: string, provider: string, model: string) {
  return db.aiUsage.create({ data: { userId, feature, provider, model, success: false } }).catch(() => {});
}

/** Provider-side failures are not fixed by retrying with a "return JSON" nudge, so they fail fast. */
function classifyProviderError(err: unknown): HttpError | null {
  if (!(err instanceof Error)) return null;
  if (err.name === 'AbortError') return new HttpError(504, 'The AI service took too long to answer. Please try again.', 'ai_timeout');
  const m = err.message.match(/^AI provider error (\d{3}):\s*(.*)$/s);
  if (!m) return null;
  const status = Number(m[1]);
  if (status === 401 || status === 403) return new HttpError(502, 'The AI provider rejected the API key. Check AI_API_KEY.', 'ai_auth');
  if (status === 429 && /quota|credit|billing/i.test(m[2])) {
    return new HttpError(503, 'The AI provider account has no credits or quota left. Add credits with your AI provider.', 'ai_quota');
  }
  if (status === 429) return new HttpError(503, 'The AI provider is rate-limiting requests. Please wait a moment and try again.', 'ai_rate_limited');
  if (status >= 500) return new HttpError(503, 'The AI provider is currently unavailable. Please try again shortly.', 'ai_unavailable');
  return new HttpError(502, `The AI provider refused the request (HTTP ${status}).`, 'ai_provider_error');
}
