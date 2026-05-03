/**
 * server/routes/internal.ts
 *
 * Internal endpoints invoked by Vercel cron. These replace the long-lived
 * `setInterval` loops that don't survive in serverless. Each tick reclaims
 * a small batch of work and returns; cron runs every minute.
 *
 * Authentication: Bearer token comparing against `INTERNAL_CRON_SECRET` env var.
 * If the secret isn't configured, endpoints fail closed with 503 to avoid
 * accidentally exposing internal jobs.
 *
 * Endpoints:
 *  - POST/GET /api/internal/worker/tick
 *      Drains up to BATCH_SIZE jobs from the queue.
 *  - POST/GET /api/internal/scheduler/tick
 *      Runs scheduled sweepers (SLA, reconciliation, workflow delays, etc.) once.
 *
 * Owners: Flow 5 (worker tick) and Flow 6 (scheduler tick) implement processBatch
 * and runScheduledTasksOnce respectively. This file is the integration point.
 */

import express, { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

const router = express.Router();

const WORKER_BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 10);
const SCHEDULER_TIMEOUT_MS = Number(process.env.SCHEDULER_TICK_TIMEOUT_MS ?? 50_000);

function authenticateCron(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTERNAL_CRON_SECRET?.trim();
  if (!secret) {
    logger.error('INTERNAL_CRON_SECRET not configured — internal endpoints disabled');
    return res.status(503).json({
      error: 'INTERNAL_CRON_NOT_CONFIGURED',
      message: 'Set INTERNAL_CRON_SECRET in Vercel environment variables to enable cron-driven workers.',
    });
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` if set in vercel.json env;
  // also accept x-vercel-cron header as fallback for native Vercel cron auth.
  const authHeader = req.headers.authorization;
  const vercelCron = req.headers['x-vercel-cron'];

  if (authHeader === `Bearer ${secret}`) return next();
  if (typeof vercelCron === 'string' && vercelCron.length > 0 && process.env.VERCEL === '1') {
    // Vercel-signed cron invocation; trust the header presence in Vercel runtime.
    return next();
  }

  logger.warn('Unauthorized internal cron invocation', {
    path: req.path,
    hasAuth: Boolean(authHeader),
    hasVercelCron: Boolean(vercelCron),
  });
  return res.status(401).json({ error: 'UNAUTHORIZED' });
}

router.use(authenticateCron);

/**
 * Worker tick — Flow 5 owns the implementation.
 *
 * Expected behavior:
 *   1. Reclaim up to WORKER_BATCH_SIZE pending jobs (atomic SQL claim).
 *   2. await Promise.all on processJob for each.
 *   3. Return { processed: N, errors: [...] } JSON.
 */
router.all('/worker/tick', async (_req, res) => {
  try {
    const { processBatch } = await import('../queue/worker.js');
    if (typeof (processBatch as any) !== 'function') {
      return res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'processBatch() not yet exported from server/queue/worker.ts (Flow 5 owner).',
      });
    }
    const result = await (processBatch as any)(WORKER_BATCH_SIZE);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    logger.error('Worker tick failed', { error: err?.message });
    return res.status(500).json({ error: 'WORKER_TICK_FAILED', message: err?.message });
  }
});

/**
 * Scheduler tick — Flow 6 owns the implementation.
 *
 * Expected behavior:
 *   1. Iterate active workspaces (or single override scope).
 *   2. Run each sweeper once: SLA enqueue, reconcile enqueue, workflow delay
 *      resume, schedule sweeper, super agent schedule, orphan sweep, session prune,
 *      event bus recovery, event log prune, churn risk scan (if due).
 *   3. Each step has its own try/catch; one failure shouldn't block the rest.
 */
router.all('/scheduler/tick', async (_req, res) => {
  try {
    const mod = await import('../queue/scheduledJobs.js');
    const runOnce = (mod as any).runScheduledTasksOnce;
    if (typeof runOnce !== 'function') {
      return res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'runScheduledTasksOnce() not yet exported from server/queue/scheduledJobs.ts (Flow 6 owner).',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCHEDULER_TIMEOUT_MS);
    try {
      const result = await runOnce({ signal: controller.signal });
      return res.json({ ok: true, ...result });
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    logger.error('Scheduler tick failed', { error: err?.message });
    return res.status(500).json({ error: 'SCHEDULER_TICK_FAILED', message: err?.message });
  }
});

export default router;
