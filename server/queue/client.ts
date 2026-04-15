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
import type {
  JobType,
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
