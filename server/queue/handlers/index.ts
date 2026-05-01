/**
 * server/queue/handlers/index.ts
 *
 * Central registry of job handlers.
 *
 * Every JobType must have exactly one handler registered here.
 * The worker calls getHandlers() on every tick so new handlers registered
 * at runtime are picked up without a restart.
 *
 * To add a handler for a new job type:
 *   1. Define the job type + payload in queue/types.ts
 *   2. Implement the handler function (can live in its own file)
 *   3. Register it in the map below
 */

import type { JobType, JobHandler, JobPayloadMap } from '../types.js';
import { JobType as JT } from '../types.js';
import { logger } from '../../utils/logger.js';
import { agentTriggerHandler } from '../../agents/orchestrator.js';
import { slaCheckHandler } from './slaCheck.js';
import { churnRiskScanHandler } from './churnRiskScan.js';

// ── Phase 0: built-in smoke-test handler ─────────────────────────────────────

const noopHandler: JobHandler<typeof JT.NOOP> = async (payload, ctx) => {
  logger.info('Noop job executed', {
    message: payload.message ?? '(no message)',
    jobId:   ctx.jobId,
  });
};

// ── Placeholder factory ───────────────────────────────────────────────────────
//
// For job types that don't have a real handler yet (Phase 1+), we register a
// placeholder that logs a clear warning instead of crashing the worker.

function placeholder<T extends JobType>(type: T): JobHandler<T> {
  return async (_payload, ctx) => {
    logger.warn(`Handler for "${type}" is not implemented yet`, {
      jobId:   ctx.jobId,
      type,
    });
    // Do NOT throw — treat as soft success so the job doesn't clog the queue
    // while the implementation is pending. Change this to `throw` once the
    // real handler exists.
  };
}

// ── Handler map ───────────────────────────────────────────────────────────────

type HandlerMap = {
  [K in JobType]: JobHandler<K>;
};

let _handlers: HandlerMap | null = null;

export function getHandlers(): HandlerMap {
  if (_handlers) return _handlers;

  _handlers = {
    // ── Phase 0 ──────────────────────────────────────────────────────────────
    [JT.NOOP]: noopHandler,

    // ── Phase 2 — ingest pipeline (placeholders until Phase 2 is built) ─────
    [JT.WEBHOOK_PROCESS]:     placeholder(JT.WEBHOOK_PROCESS),
    [JT.CHANNEL_INGEST]:      placeholder(JT.CHANNEL_INGEST),
    [JT.CANONICALIZE]:        placeholder(JT.CANONICALIZE),
    [JT.INTENT_ROUTE]:        placeholder(JT.INTENT_ROUTE),

    // ── Phase 3 — reconciliation ─────────────────────────────────────────────
    [JT.RECONCILE_CASE]:      placeholder(JT.RECONCILE_CASE),
    [JT.RECONCILE_SCHEDULED]: placeholder(JT.RECONCILE_SCHEDULED),

    // ── Phase 4 — resolution ─────────────────────────────────────────────────
    [JT.RESOLUTION_PLAN]:     placeholder(JT.RESOLUTION_PLAN),
    [JT.RESOLUTION_EXECUTE]:  placeholder(JT.RESOLUTION_EXECUTE),
    [JT.RESOLUTION_ROLLBACK]: placeholder(JT.RESOLUTION_ROLLBACK),

    // ── Phase 5 — communication ──────────────────────────────────────────────
    [JT.DRAFT_REPLY]:         placeholder(JT.DRAFT_REPLY),
    [JT.SEND_MESSAGE]:        placeholder(JT.SEND_MESSAGE),

    // ── Phase 6 — observability ──────────────────────────────────────────────
    [JT.SLA_CHECK]:           slaCheckHandler,
    [JT.CHURN_RISK_SCAN]:     churnRiskScanHandler,

    // ── Phase 7 — agent engine ───────────────────────────────────────────────
    [JT.AGENT_TRIGGER]:       agentTriggerHandler,
  } as HandlerMap;

  return _handlers;
}

/**
 * Registers (or replaces) a handler at runtime.
 * Used by each phase's implementation module to inject real handlers.
 */
export function registerHandler<T extends JobType>(
  type: T,
  handler: JobHandler<T>
): void {
  const map = getHandlers();
  (map as any)[type] = handler;
  logger.debug('Handler registered', { type });
}
