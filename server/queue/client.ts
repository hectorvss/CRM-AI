/**
 * server/queue/client.ts
 *
 * Public API for enqueueing jobs. Refactored to use JobRepository (Provider-agnostic).
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { QueueError } from '../errors.js';
import { createJobRepository } from '../data/index.js';
import { JobType } from './types.js';
import type {
  JobPayloadMap,
  EnqueueOptions,
} from './types.js';

let jobRepo: ReturnType<typeof createJobRepository> | null = null;

function getJobRepo() {
  if (!jobRepo) {
    jobRepo = createJobRepository();
  }
  return jobRepo;
}

// ── Serverless real-time bridge ──────────────────────────────────────────────
// On Vercel there is no always-on worker, so inbound-message jobs would sit in
// the queue until the (daily) cron. After enqueuing one, drain the queue inline
// so the case + message reach the inbox in real time. Follows the two-hop
// webhook.process → channel.ingest chain by looping until the queue is empty,
// the time budget is spent, or a few passes are done. Best-effort: anything left
// over is picked up by the worker/cron backstop.
//
// Gated to (a) the serverless runtime — a dedicated always-on worker has its own
// poll loop and must NOT be double-driven; and (b) the inbound job types — other
// jobs (SLA, reconcile, AI, etc.) keep flowing through the normal worker. A
// re-entrancy flag stops the chain's nested enqueues from recursing.
const INLINE_DRAIN_TYPES = new Set<string>([JobType.WEBHOOK_PROCESS, JobType.CHANNEL_INGEST]);
let inlineDraining = false;

async function maybeDrainInline(type: string): Promise<void> {
  if (inlineDraining) return;
  if (!process.env.VERCEL) return;            // only on serverless; the worker host polls
  if (!INLINE_DRAIN_TYPES.has(type)) return;  // only inbound-message jobs

  inlineDraining = true;
  const ac = new AbortController();
  // Keep the webhook response well under provider timeouts. If we run out of
  // budget the remaining jobs stay queued for the backstop; inbound webhooks are
  // deduped (dedupe_key), so a provider retry is harmless.
  const budget = setTimeout(() => ac.abort(), 8_000);
  try {
    const { processBatch } = await import('./worker.js');
    const limit = config.queue.concurrency ?? 5;
    for (let pass = 0; pass < 6 && !ac.signal.aborted; pass++) {
      const { processed } = await processBatch(limit, { signal: ac.signal });
      if (!processed) break;
    }
  } catch (err) {
    logger.warn('Inline queue drain failed (job stays queued for the worker/cron)', {
      error: (err as any)?.message,
    });
  } finally {
    clearTimeout(budget);
    inlineDraining = false;
  }
}

/**
 * Persists a job via the repository.
 * Returns the new job's ID.
 */
export async function enqueue<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  options: EnqueueOptions = {}
): Promise<string> {
  const id          = randomUUID();
  const priority    = options.priority    ?? 10;
  const maxAttempts = options.maxAttempts ?? config.queue.defaultMaxAttempts;
  const tenantId    = options.tenantId    ?? null;
  const workspaceId = options.workspaceId ?? null;
  const traceId     = options.traceId     ?? randomUUID();
  const delayMs     = options.delayMs     ?? 0;

  const runAt = new Date(Date.now() + delayMs).toISOString();

  try {
    await getJobRepo().enqueue({
      id,
      type,
      payload,
      priority,
      maxAttempts,
      runAt,
      tenantId,
      workspaceId,
      traceId,
    });
  } catch (err) {
    throw new QueueError(`Failed to enqueue job of type "${type}"`, {
      type,
      cause: err,
    });
  }

  logger.debug('Job enqueued', { jobId: id, type, priority, runAt, traceId });

  // Real-time on serverless: drain inbound-message jobs immediately (no-op off
  // Vercel and for non-inbound types). Never let a drain failure break enqueue.
  await maybeDrainInline(type).catch(() => { /* best-effort */ });

  return id;
}

/** Enqueue a delayed job */
export async function enqueueDelayed<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  delayMs: number,
  options: Omit<EnqueueOptions, 'delayMs'> = {}
): Promise<string> {
  return enqueue(type, payload, { ...options, delayMs });
}

/** Enqueue a high-priority job */
export async function enqueueUrgent<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  options: Omit<EnqueueOptions, 'priority'> = {}
): Promise<string> {
  return enqueue(type, payload, { ...options, priority: 1 });
}

/** Fetch a single job row by ID */
export async function getJob(id: string): Promise<any> {
  return getJobRepo().getJob(id);
}

/** Count jobs by status */
export async function countJobs(): Promise<Record<string, number>> {
  return getJobRepo().countJobs();
}

/** Manually re-enqueue a dead job */
export async function retryDeadJob(id: string): Promise<boolean> {
  return getJobRepo().retryDeadJob(id);
}
