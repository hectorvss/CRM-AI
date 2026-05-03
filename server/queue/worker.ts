/**
 * server/queue/worker.ts
 *
 * Refactored to use JobRepository (Provider-agnostic).
 *
 * Two execution modes share the same job-processing core:
 *
 *   1. Standalone / dev mode (`startWorker()`): a long-lived poll loop that
 *      claims and processes jobs concurrently. Used by `npm run worker` via
 *      `server/worker-standalone.ts`.
 *
 *   2. Cron-driven mode (`processBatch()`): a single-shot function that
 *      reclaims up to N jobs and processes them with `await Promise.all`,
 *      returning a per-job summary. Invoked by Vercel cron through
 *      `server/routes/internal.ts` → `/api/internal/worker/tick`.
 *
 * Both paths share `processJob()` and `runJobs()`; there is no `setInterval`
 * involved in the cron path.
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isRetryable } from '../errors.js';
import { getHandlers } from './handlers/index.js';
import { createJobRepository } from '../data/index.js';
import type { JobContext, JobType } from './types.js';

let jobRepo: ReturnType<typeof createJobRepository> | null = null;

function getJobRepo() {
  if (!jobRepo) {
    jobRepo = createJobRepository();
  }
  return jobRepo;
}

// ── State ─────────────────────────────────────────────────────────────────────

let running   = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

// Track currently-processing job IDs
const inFlight = new Set<string>();

// ── Back-off ──────────────────────────────────────────────────────────────────

function backoffMs(attempt: number): number {
  const base    = config.queue.backoffBaseMs;
  const exp     = base * Math.pow(2, attempt);
  const jitter  = Math.random() * 1000;
  return Math.min(exp + jitter, 5 * 60 * 1000);
}

// ── Claim & release ───────────────────────────────────────────────────────────

async function claimJobs(limit: number): Promise<any[]> {
  const jobs: any[] = [];
  for (let i = 0; i < limit; i++) {
    const job = await getJobRepo().claimJob();
    if (!job) break;
    jobs.push(job);
  }
  return jobs;
}

async function markCompleted(id: string): Promise<void> {
  await getJobRepo().finishJob(id, {
    status: 'completed',
    finishedAt: new Date().toISOString()
  });
}

async function markFailed(id: string, err: unknown, attempts: number, maxAttempts: number): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const canRetry = isRetryable(err) && attempts < maxAttempts;

  if (canRetry) {
    const runAt = new Date(Date.now() + backoffMs(attempts)).toISOString();
    await getJobRepo().rescheduleJob(id, {
      runAt,
      error: message,
    });
  } else {
    await getJobRepo().finishJob(id, {
      status: 'dead',
      finishedAt: new Date().toISOString(),
      error: message
    });
  }
}

// ── Process one job ───────────────────────────────────────────────────────────
//
// `processJob` is intentionally exception-safe: it must NEVER throw. Any
// internal error is captured and routed through `markFailed` so the queue
// state stays consistent. This is what allows `Promise.all` over a batch to
// never reject (we still inspect results to surface per-job errors).

async function processJob(row: any): Promise<{ ok: boolean; jobId: string; error?: string }> {
  const log = logger.child({
    jobId:    row.id,
    type:     row.type,
    attempt:  row.attempts,
    traceId:  row.trace_id ?? undefined,
  });

  log.info('Job started');
  inFlight.add(row.id);

  const ctx: JobContext = {
    jobId:       row.id,
    traceId:     row.trace_id ?? randomUUID(),
    tenantId:    row.tenant_id,
    workspaceId: row.workspace_id,
    attempt:     row.attempts,
  };

  let payload: unknown;
  try {
    payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  } catch {
    const msg = 'Corrupt payload: invalid JSON';
    try {
      await markFailed(row.id, new Error(msg), row.attempts, 0);
    } catch (markErr) {
      log.error('Failed to mark corrupt-payload job as failed', {
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }
    inFlight.delete(row.id);
    log.error('Job has corrupt payload, moved to dead');
    return { ok: false, jobId: row.id, error: msg };
  }

  const handlers = getHandlers();
  const handler  = handlers[row.type as JobType];

  if (!handler) {
    const msg = `No handler registered for job type: ${row.type}`;
    try {
      await markFailed(row.id, new Error(msg), row.attempts, 0);
    } catch (markErr) {
      log.error('Failed to mark missing-handler job as failed', {
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }
    inFlight.delete(row.id);
    log.warn('No handler found for job type');
    return { ok: false, jobId: row.id, error: msg };
  }

  try {
    await (handler as any)(payload, ctx);
    await markCompleted(row.id);
    log.info('Job completed');
    return { ok: true, jobId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await markFailed(row.id, err, row.attempts, row.max_attempts);
    } catch (markErr) {
      log.error('Failed to persist job failure status', {
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }

    const willRetry = isRetryable(err) && row.attempts < row.max_attempts;
    if (willRetry) {
      log.warn('Job failed, will retry', { error: message });
    } else {
      log.error('Job failed permanently', err);
    }
    return { ok: false, jobId: row.id, error: message };
  } finally {
    inFlight.delete(row.id);
  }
}

// ── Batch runner (shared by tick + processBatch) ──────────────────────────────

interface BatchSummary {
  processed: number;
  failed: number;
  errors: Array<{ jobId: string; error: string }>;
}

async function runJobs(jobs: any[]): Promise<BatchSummary> {
  if (jobs.length === 0) {
    return { processed: 0, failed: 0, errors: [] };
  }

  const results = await Promise.all(jobs.map(j => processJob(j)));

  let processed = 0;
  let failed = 0;
  const errors: Array<{ jobId: string; error: string }> = [];

  for (const r of results) {
    if (r.ok) {
      processed += 1;
    } else {
      failed += 1;
      errors.push({ jobId: r.jobId, error: r.error ?? 'unknown error' });
    }
  }

  return { processed, failed, errors };
}

// ── Poll loop (standalone / dev mode only) ────────────────────────────────────

async function tick(): Promise<void> {
  if (!running) return;

  const available = config.queue.concurrency - inFlight.size;

  if (available > 0) {
    const jobs = await claimJobs(available);

    if (jobs.length > 0) {
      logger.debug('Worker tick: claimed jobs', { count: jobs.length, inFlight: inFlight.size });
      // Wait for the batch so errors propagate into logs and the next tick
      // doesn't run before its predecessor is settled.
      await runJobs(jobs);
    }
  }

  if (running) {
    pollTimer = setTimeout(tick, config.queue.pollIntervalMs);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Cron-driven entry point. Reclaims up to `limit` jobs and processes them
 * concurrently. Returns a per-job summary; never rejects on individual job
 * failure (handler errors are captured and routed through `markFailed`).
 *
 * @param limit Maximum number of jobs to claim in this invocation.
 * @param opts.signal Optional AbortSignal for cooperative early-exit. If
 *   the signal fires *before* claiming jobs, the function returns early.
 *   Once jobs are claimed they always run to completion (handlers are
 *   responsible for their own per-call timeouts).
 */
export async function processBatch(
  limit: number,
  opts: { signal?: AbortSignal } = {}
): Promise<BatchSummary> {
  const safeLimit = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 1));

  if (opts.signal?.aborted) {
    logger.warn('processBatch aborted before start');
    return { processed: 0, failed: 0, errors: [] };
  }

  const jobs = await claimJobs(safeLimit);

  if (jobs.length === 0) {
    logger.debug('processBatch: no pending jobs');
    return { processed: 0, failed: 0, errors: [] };
  }

  logger.info('processBatch: claimed jobs', { count: jobs.length, limit: safeLimit });
  const summary = await runJobs(jobs);

  logger.info('processBatch: done', {
    claimed:   jobs.length,
    processed: summary.processed,
    failed:    summary.failed,
  });

  return summary;
}

export function startWorker(): void {
  if (running) {
    logger.warn('Worker already running — startWorker() called twice');
    return;
  }
  running = true;
  logger.info('Queue worker started', {
    concurrency:    config.queue.concurrency,
    pollIntervalMs: config.queue.pollIntervalMs,
    provider:       config.db.provider
  });
  void getJobRepo().quarantineOrphanJobs()
    .then((count) => {
      if (count > 0) {
        logger.info('Quarantined orphan jobs at startup', { count });
      }
    })
    .catch((err) => {
      logger.warn('Failed to quarantine orphan jobs at startup', {
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      void tick();
    });
}

export function stopWorker(): Promise<void> {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  return new Promise(resolve => {
    const deadline = Date.now() + 30_000;

    const wait = () => {
      if (inFlight.size === 0 || Date.now() >= deadline) {
        logger.info('Queue worker stopped', { pendingAtShutdown: inFlight.size });
        resolve();
      } else {
        logger.info('Waiting for in-flight jobs', { count: inFlight.size });
        setTimeout(wait, 500);
      }
    };

    wait();
  });
}

export function workerStatus(): { running: boolean; inFlight: number } {
  return { running, inFlight: inFlight.size };
}
