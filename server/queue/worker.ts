/**
 * server/queue/worker.ts
 *
 * The background worker that continuously polls the `jobs` table and processes
 * eligible jobs with bounded concurrency, exponential back-off, and a dead-
 * letter outcome when all retries are exhausted.
 *
 * Lifecycle:
 *   startWorker()  — call once at server boot; starts the poll loop
 *   stopWorker()   — call on graceful shutdown (SIGTERM/SIGINT)
 *
 * Concurrency model:
 *   The worker polls every `config.queue.pollIntervalMs` ms.
 *   On each tick it picks up to `config.queue.concurrency` pending jobs and
 *   runs them in parallel using Promise.allSettled — one slow job never blocks
 *   the others.
 *
 * Retry model:
 *   - If a job handler throws a retryable error it is put back to 'pending'
 *     with run_at = now + backoff(attempt).
 *   - If max_attempts is reached, status becomes 'dead' (no more retries).
 *   - Non-retryable errors go straight to 'dead'.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isRetryable } from '../errors.js';
import { getHandlers } from './handlers/index.js';
import type { JobRow, JobContext, JobType } from './types.js';

// ── State ─────────────────────────────────────────────────────────────────────

let running   = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

// Track currently-processing job IDs so we don't pick them up twice
const inFlight = new Set<string>();

// ── Back-off ──────────────────────────────────────────────────────────────────

function backoffMs(attempt: number): number {
  const base    = config.queue.backoffBaseMs;   // e.g. 2000
  const exp     = base * Math.pow(2, attempt);  // 2s, 4s, 8s …
  const jitter  = Math.random() * 1000;
  return Math.min(exp + jitter, 5 * 60 * 1000); // cap at 5 min
}

// ── Claim & release ───────────────────────────────────────────────────────────

/**
 * Atomically claim up to `limit` pending jobs that are due to run.
 * Uses a SQLite UPDATE-RETURNING pattern to prevent two workers (or two
 * poll ticks) from picking the same job.
 */
function claimJobs(limit: number): JobRow[] {
  const db  = getDb();
  const now = new Date().toISOString();

  // SQLite doesn't support UPDATE…RETURNING in all versions, so we use a
  // transaction: SELECT then UPDATE, guarded by status check.
  const claim = db.transaction(() => {
    const rows = db.prepare(`
      SELECT * FROM jobs
      WHERE  status  = 'pending'
        AND  run_at <= ?
        AND  id NOT IN (SELECT value FROM json_each(?))
      ORDER BY priority ASC, run_at ASC
      LIMIT ?
    `).all(now, JSON.stringify([...inFlight]), limit) as JobRow[];

    for (const row of rows) {
      db.prepare(`
        UPDATE jobs
        SET    status     = 'processing',
               started_at = ?,
               attempts   = attempts + 1
        WHERE  id = ? AND status = 'pending'
      `).run(now, row.id);
    }

    return rows;
  });

  return claim();
}

function markCompleted(id: string): void {
  getDb().prepare(`
    UPDATE jobs
    SET status = 'completed', finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

function markFailed(id: string, err: unknown, attempts: number, maxAttempts: number): void {
  const db      = getDb();
  const message = err instanceof Error ? err.message : String(err);
  const canRetry = isRetryable(err) && attempts < maxAttempts;

  if (canRetry) {
    const runAt = new Date(Date.now() + backoffMs(attempts)).toISOString();
    db.prepare(`
      UPDATE jobs
      SET status = 'pending', error = ?, run_at = ?, finished_at = NULL
      WHERE id = ?
    `).run(message, runAt, id);
  } else {
    db.prepare(`
      UPDATE jobs
      SET status = 'dead', error = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(message, id);
  }
}

// ── Process one job ───────────────────────────────────────────────────────────

async function processJob(row: JobRow): Promise<void> {
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
    payload = JSON.parse(row.payload);
  } catch {
    // Corrupt payload — mark dead immediately, no retry
    markFailed(row.id, new Error('Corrupt payload: invalid JSON'), row.attempts, 0);
    inFlight.delete(row.id);
    log.error('Job has corrupt payload, moved to dead');
    return;
  }

  const handlers = getHandlers();
  const handler  = handlers[row.type as JobType];

  if (!handler) {
    markFailed(
      row.id,
      new Error(`No handler registered for job type: ${row.type}`),
      row.attempts,
      0  // non-retryable — won't be fixed by retrying
    );
    inFlight.delete(row.id);
    log.warn('No handler found for job type');
    return;
  }

  try {
    await (handler as any)(payload, ctx);
    markCompleted(row.id);
    log.info('Job completed');
  } catch (err) {
    markFailed(row.id, err, row.attempts, row.max_attempts);

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
    const jobs = claimJobs(available);

    if (jobs.length > 0) {
      logger.debug('Worker tick: claimed jobs', { count: jobs.length, inFlight: inFlight.size });
      // Run all claimed jobs in parallel; errors are caught inside processJob
      await Promise.allSettled(jobs.map(processJob));
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
  });
  tick();
}

export function stopWorker(): Promise<void> {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  // Wait for in-flight jobs to finish (up to 30 s)
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
