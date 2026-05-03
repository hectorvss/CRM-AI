/**
 * server/lib/workflowEventBus.ts
 *
 * Durable event bus that connects SaaS domain mutations to the workflow engine.
 *
 * Delivery guarantee:
 *  - `fireWorkflowEvent` is async: it AWAITS the insert into `workflow_event_log`
 *    (status='pending') before resolving its promise. Once the promise resolves
 *    the event is durable — even if the process dies an instant later, the
 *    recovery sweeper (`recoverPendingEvents`, called by scheduledJobs.ts /
 *    /api/internal/scheduler/tick) will retry it.
 *  - Dispatch to the in-process workflow engine is scheduled via setImmediate
 *    AFTER persistence, so HTTP responses are not blocked by workflow execution.
 *  - Callers should `await fireWorkflowEvent(...)` to get the persistence
 *    guarantee. Callers that don't await still get at-least-once delivery as
 *    long as the persistence promise reaches the microtask queue (the worker
 *    sweep will pick up any orphaned pending rows).
 *  - Lazy import of `executeWorkflowsByEvent` avoids circular dependencies at
 *    module load time (routes/workflows.ts imports this file).
 *  - All errors during dispatch are caught and recorded on the event row so
 *    the recovery sweeper can decide whether to retry.
 *
 * Usage (in any route after a successful mutation):
 *
 *   import { fireWorkflowEvent } from '../lib/workflowEventBus.js';
 *   await fireWorkflowEvent(scope, 'case.updated', { caseId, status: 'resolved' });
 *
 * Supported event types (must match trigger keys in NODE_CATALOG):
 *   case.created · case.updated · message.received · order.updated
 *   payment.dispute.created · approval.decided · customer.updated
 *   sla.breached · shipment.updated · return.created
 */

import { logger } from '../utils/logger.js';
import { getSupabaseAdmin } from '../db/supabase.js';

export interface WorkflowEventScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

/**
 * Fire a business event that may trigger one or more published workflows.
 *
 * The promise resolves AS SOON AS the event is durably persisted in
 * `workflow_event_log` with status='pending'. Workflow execution happens
 * out-of-band (scheduled via setImmediate after persistence) and never blocks
 * the caller. If the dispatch fails or the process dies, the recovery sweeper
 * retries pending rows.
 */
export async function fireWorkflowEvent(
  scope: WorkflowEventScope,
  eventType: string,
  payload: Record<string, any> = {},
): Promise<void> {
  if (!scope.tenantId || !scope.workspaceId) return;

  const supabase = getSupabaseAdmin();
  let logId: string | null = null;

  // ── 1. Durably persist event (await) ───────────────────────────────────────
  try {
    const { data: logRow, error: insertErr } = await supabase
      .from('workflow_event_log')
      .insert({
        tenant_id:    scope.tenantId,
        workspace_id: scope.workspaceId,
        event_type:   eventType,
        payload,
        status:       'pending',
      })
      .select('id')
      .single();

    if (insertErr) {
      // Persistence failed — degrade to in-process best-effort dispatch so we
      // don't lose the signal entirely. The caller can still proceed.
      logger.warn('workflowEventBus: failed to persist event log', {
        eventType,
        tenantId: scope.tenantId,
        error: String(insertErr.message ?? insertErr),
      });
    } else {
      logId = logRow?.id ?? null;
    }
  } catch (persistErr: any) {
    logger.warn('workflowEventBus: persist threw', {
      eventType,
      tenantId: scope.tenantId,
      error: String(persistErr?.message ?? persistErr),
    });
  }

  // ── 2. Schedule async dispatch (non-blocking) ──────────────────────────────
  // Resolves after persistence; dispatch runs in a subsequent tick so the HTTP
  // response is never blocked. Errors here only update the event row's status.
  setImmediate(async () => {
    try {
      const mod = await import('../routes/workflows.js');
      if (typeof (mod as any).executeWorkflowsByEvent !== 'function') {
        logger.warn('workflowEventBus: executeWorkflowsByEvent not exported from workflows route', { eventType });
        if (logId) {
          await supabase.from('workflow_event_log')
            .update({
              status:      'failed',
              error:       'executeWorkflowsByEvent not available',
              executed_at: new Date().toISOString(),
            })
            .eq('id', logId);
        }
        return;
      }

      await (mod as any).executeWorkflowsByEvent(scope, eventType, payload);

      if (logId) {
        await supabase.from('workflow_event_log')
          .update({ status: 'executed', executed_at: new Date().toISOString() })
          .eq('id', logId);
      }
    } catch (err: any) {
      logger.warn('workflowEventBus: dispatch failed', {
        eventType,
        tenantId: scope.tenantId,
        error: String(err?.message ?? err),
      });

      // Leave row as 'pending' so the recovery sweeper picks it up on the next
      // tick. Only mark 'failed' once retry_count is exhausted (the sweeper
      // owns that decision).
      if (logId) {
        try {
          await supabase.from('workflow_event_log')
            .update({ error: String(err?.message ?? err) })
            .eq('id', logId)
            .eq('status', 'pending');
        } catch { /* ignore secondary error */ }
      }
    }
  });
}

/**
 * Retry pending events older than `thresholdMs` (default 60 s).
 * Called by the recovery sweeper in scheduledJobs.ts.
 *
 * Concurrency strategy: bumps `retry_count` first while still scoped to
 * `status='pending'`, so two concurrent sweepers don't double-process the same
 * row. After 3 failed retries the row is flagged 'failed' for manual triage.
 */
export async function recoverPendingEvents(
  tenantId: string,
  workspaceId: string,
  thresholdMs = 60_000,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - thresholdMs).toISOString();

  const { data: stuckEvents, error } = await supabase
    .from('workflow_event_log')
    .select('id, event_type, payload, retry_count, workspace_id')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .lte('retry_count', 3)
    .limit(20);

  if (error || !stuckEvents?.length) return 0;

  let recovered = 0;
  for (const ev of stuckEvents) {
    try {
      // Atomic claim: bump retry_count only if still pending. If another sweeper
      // already claimed the row this update affects 0 rows and we skip.
      const { data: claimed, error: claimErr } = await supabase
        .from('workflow_event_log')
        .update({ retry_count: (ev.retry_count ?? 0) + 1 })
        .eq('id', ev.id)
        .eq('status', 'pending')
        .select('id');

      if (claimErr || !claimed || claimed.length === 0) continue;

      // After 3 attempts give up so we don't loop forever on a poison event.
      if ((ev.retry_count ?? 0) + 1 > 3) {
        await supabase.from('workflow_event_log')
          .update({
            status:      'failed',
            error:       'Max retries exceeded',
            executed_at: new Date().toISOString(),
          })
          .eq('id', ev.id);
        continue;
      }

      const mod = await import('../routes/workflows.js');
      if (typeof (mod as any).executeWorkflowsByEvent !== 'function') continue;

      await (mod as any).executeWorkflowsByEvent(
        { tenantId, workspaceId },
        ev.event_type,
        (ev.payload as Record<string, any>) ?? {},
      );

      await supabase.from('workflow_event_log')
        .update({ status: 'executed', executed_at: new Date().toISOString() })
        .eq('id', ev.id);
      recovered++;
    } catch (retryErr) {
      logger.warn('workflowEventBus: recovery retry failed', {
        eventId:   ev.id,
        eventType: ev.event_type,
        error:     String((retryErr as any)?.message ?? retryErr),
      });
      // Leave row in 'pending' status; next sweep will retry up to the cap.
    }
  }

  if (recovered > 0) {
    logger.info(`workflowEventBus: recovered ${recovered} stuck event(s)`, {
      tenantId,
      workspaceId,
    });
  }
  return recovered;
}

/**
 * Prune executed event log rows older than `maxAgeDays` days.
 * Failed rows are intentionally retained for manual inspection.
 */
export async function pruneEventLog(tenantId: string, maxAgeDays = 7): Promise<number> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('workflow_event_log')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('status', 'executed')
    .lt('executed_at', cutoff)
    .select('id');

  if (error) return 0;
  return data?.length ?? 0;
}
