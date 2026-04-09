import { logger } from '../utils/logger.js';

interface RetryOptions {
  label: string;
  attempts?: number;
  baseDelayMs?: number;
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('503') ||
    message.includes('Service Unavailable') ||
    message.includes('high demand') ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1200;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === attempts) {
        throw error;
      }

      const delayMs = baseDelayMs * attempt;
      logger.warn('Gemini call retrying after transient failure', {
        label: options.label,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
