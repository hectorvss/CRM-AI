/**
 * server/queue/worker.ts
 *
 * Refactored to use JobRepository (Provider-agnostic).
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
    await getJobRepo().finishJob(id, {
      status: 'pending',
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

async function processJob(row: any): Promise<void> {
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
    await markFailed(row.id, new Error('Corrupt payload: invalid JSON'), row.attempts, 0);
    inFlight.delete(row.id);
    log.error('Job has corrupt payload, moved to dead');
    return;
  }

  const handlers = getHandlers();
  const handler  = handlers[row.type as JobType];

  if (!handler) {
    await markFailed(
      row.id,
      new Error(`No handler registered for job type: ${row.type}`),
      row.attempts,
      0
    );
    inFlight.delete(row.id);
    log.warn('No handler found for job type');
    return;
  }

  try {
    await (handler as any)(payload, ctx);
    await markCompleted(row.id);
    log.info('Job completed');
  } catch (err) {
    await markFailed(row.id, err, row.attempts, row.max_attempts);

    const willRetry = isRetryable(err) && row.attempts < row.max_attempts;
    if (willRetry) {
      log.warn('Job failed, will retry', { error: err instanceof Error ? err.message : String(err) });
    } else {
      log.error('Job failed permanently', err);
    }
  } finally {
    inFlight.delete(row.id);
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (!running) return;

  const available = config.queue.concurrency - inFlight.size;

  if (available > 0) {
    const jobs = await claimJobs(available);

    if (jobs.length > 0) {
      logger.debug('Worker tick: claimed jobs', { count: jobs.length, inFlight: inFlight.size });
      // Non-blocking parallel execution
      jobs.map(j => processJob(j));
    }
  }

  if (running) {
    pollTimer = setTimeout(tick, config.queue.pollIntervalMs);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

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
      tick();
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
