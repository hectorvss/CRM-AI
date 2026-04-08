/**
 * server/utils/retry.ts
 *
 * Retry logic and timeout helpers used by the integration base client and
 * the queue worker.
 *
 * Strategy: exponential back-off with optional jitter.
 *   delay(attempt) = baseMs * 2^attempt + jitter(0..jitterMs)
 *
 * Usage:
 *   const result = await withRetry(() => fetchSomething(), {
 *     maxAttempts: 3,
 *     baseMs: 1000,
 *     shouldRetry: (err) => isRetryable(err),
 *   });
 */

import { isRetryable } from '../errors.js';
import { logger } from './logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Total number of attempts (first try + retries). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before first retry. Default: 1000 */
  baseMs?: number;
  /** Maximum delay cap in ms. Default: 30 000 */
  maxDelayMs?: number;
  /** Random jitter ceiling in ms added to each delay. Default: 500 */
  jitterMs?: number;
  /**
   * Predicate that decides whether an error is worth retrying.
   * Defaults to `isRetryable` from errors.ts.
   */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Label used in log messages (e.g. "Shopify.getOrder") */
  label?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeDelay(
  attempt: number,
  baseMs: number,
  maxDelayMs: number,
  jitterMs: number
): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter      = Math.random() * jitterMs;
  return Math.min(exponential + jitter, maxDelayMs);
}

// ── withRetry ─────────────────────────────────────────────────────────────────

/**
 * Runs `fn` up to `maxAttempts` times, retrying on retryable errors with
 * exponential back-off + jitter.
 *
 * Throws the last error if all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseMs      = 1000,
    maxDelayMs  = 30_000,
    jitterMs    = 500,
    shouldRetry = isRetryable,
    label       = 'operation',
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLast = attempt === maxAttempts - 1;

      if (isLast || !shouldRetry(err, attempt)) {
        throw err;
      }

      const delayMs = computeDelay(attempt, baseMs, maxDelayMs, jitterMs);

      logger.warn(`Retrying ${label}`, {
        attempt:    attempt + 1,
        maxAttempts,
        delayMs:    Math.round(delayMs),
        error:      err instanceof Error ? err.message : String(err),
      });

      await sleep(delayMs);
    }
  }

  // Should never reach here but TypeScript needs a throw
  throw lastError;
}

// ── withTimeout ───────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a hard timeout. Throws a `TimeoutError` if `fn` does
 * not resolve within `ms` milliseconds.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  label = 'operation'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TimeoutError(label, ms)),
      ms
    );

    fn()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ── withRetryAndTimeout ───────────────────────────────────────────────────────

/**
 * Convenience: applies both a per-attempt timeout and retry logic.
 * Each individual attempt must complete within `timeoutMs`.
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  options: RetryOptions & { timeoutMs: number }
): Promise<T> {
  const { timeoutMs, label = 'operation', ...retryOpts } = options;

  return withRetry(
    () => withTimeout(fn, timeoutMs, label),
    { ...retryOpts, label }
  );
}
