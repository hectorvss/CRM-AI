/**
 * server/queue/client.ts
 *
 * Public API for enqueueing jobs. This is the only file the rest of the
 * server needs to import when it wants to schedule async work.
 *
 * Under the hood jobs are persisted to the `jobs` SQLite table so they
 * survive server restarts and are never lost if the process crashes between
 * the time a job is created and when it is picked up by the worker.
 *
 * Usage:
 *   import { enqueue } from '../queue/client.js';
 *   import { JobType } from '../queue/types.js';
 *
 *   await enqueue(JobType.WEBHOOK_PROCESS, {
 *     webhookEventId: 'wh_123',
 *     source: 'shopify',
 *     rawBody: '...',
 *     headers: {},
 *   });
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { QueueError } from '../errors.js';
import type {
  JobType,
  JobPayloadMap,
  EnqueueOptions,
  JobRow,
} from './types.js';

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Persists a job to the database. The worker will pick it up as soon as a
 * slot is available (respecting `delayMs` and `priority`).
 *
 * Returns the new job's ID.
 */
export function enqueue<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  options: EnqueueOptions = {}
): string {
  const db = getDb();

  const id          = randomUUID();
  const priority    = options.priority    ?? 10;
  const maxAttempts = options.maxAttempts ?? config.queue.defaultMaxAttempts;
  const tenantId    = options.tenantId    ?? null;
  const workspaceId = options.workspaceId ?? null;
  const traceId     = options.traceId     ?? randomUUID();
  const delayMs     = options.delayMs     ?? 0;

  // run_at = now + delay
  const runAt = new Date(Date.now() + delayMs).toISOString();

  try {
    db.prepare(`
      INSERT INTO jobs
        (id, type, payload, status, priority, attempts, max_attempts,
         run_at, started_at, finished_at, error, created_at,
         tenant_id, workspace_id, trace_id)
      VALUES
        (?, ?, ?, 'pending', ?, 0, ?, ?, NULL, NULL, NULL,
         CURRENT_TIMESTAMP, ?, ?, ?)
    `).run(
      id,
      type,
      JSON.stringify(payload),
      priority,
      maxAttempts,
      runAt,
      tenantId,
      workspaceId,
      traceId,
    );
  } catch (err) {
    throw new QueueError(`Failed to enqueue job of type "${type}"`, {
      type,
      cause: err,
    });
  }

  logger.debug('Job enqueued', { jobId: id, type, priority, runAt, traceId });
  return id;
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/** Enqueue a delayed job (shorthand for passing delayMs in options) */
export function enqueueDelayed<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  delayMs: number,
  options: Omit<EnqueueOptions, 'delayMs'> = {}
): string {
  return enqueue(type, payload, { ...options, delayMs });
}

/** Enqueue a high-priority job (priority = 1, processed before default) */
export function enqueueUrgent<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  options: Omit<EnqueueOptions, 'priority'> = {}
): string {
  return enqueue(type, payload, { ...options, priority: 1 });
}

// ── Job query helpers (used by worker and admin routes) ───────────────────────

/** Fetch a single job row by ID */
export function getJob(id: string): JobRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return (row as JobRow) ?? null;
}

/** Count jobs by status (for health/dashboard endpoints) */
export function countJobs(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT status, COUNT(*) as count FROM jobs GROUP BY status
  `).all() as Array<{ status: string; count: number }>;

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});
}

/** Manually re-enqueue a dead job for one more attempt */
export function retryDeadJob(id: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'pending', attempts = 0, error = NULL,
        run_at = CURRENT_TIMESTAMP, finished_at = NULL
    WHERE id = ? AND status = 'dead'
  `).run(id);
  return result.changes > 0;
}
