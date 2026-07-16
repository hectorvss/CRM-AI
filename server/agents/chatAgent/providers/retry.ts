/**
 * server/agents/chatAgent/providers/retry.ts
 *
 * Generic retry for LLM API calls — replaces withGeminiRetry for the new
 * agent surfaces. Retries transient failures (429, 5xx, overloaded, network)
 * with exponential backoff + jitter; never retries auth/validation errors.
 */

import { logger } from '../../../utils/logger.js';

const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

function isRetriable(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string; error?: { type?: string } };
  if (typeof e?.status === 'number' && RETRIABLE_STATUS.has(e.status)) return true;
  if (e?.error?.type === 'overloaded_error') return true;
  const msg = String(e?.message ?? '').toLowerCase();
  return (
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  );
}

export async function withLLMRetry<T>(
  fn: () => Promise<T>,
  opts: { label: string; attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 750;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isRetriable(err)) throw err;
      const delay = base * 2 ** (attempt - 1) * (0.5 + Math.random());
      logger.warn('chatAgent LLM call retrying', {
        label: opts.label,
        attempt,
        delayMs: Math.round(delay),
        error: (err as Error)?.message,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
