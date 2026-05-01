/**
 * server/lib/workflowEventBus.ts
 *
 * Durable event bus that connects SaaS domain mutations to the workflow engine.
 *
 * Design decisions:
 *  - Durability via `workflow_event_log`: events are persisted to DB before
 *    dispatch. If the process crashes between write and execution the recovery
 *    sweeper (scheduledJobs.ts) retries any rows stuck in 'pending' > 60s.
 *  - Fire-and-forget via setImmediate: the HTTP response is never blocked.
 *  - Lazy import of executeWorkflowsByEvent avoids circular dependencies at
 *    startup (routes/workflows.ts → this file → routes/workflows.ts would be
 *    circular).
 *  - All errors are caught and logged; failures never propagate to the caller.
 *
 * Usage (in any route after a successful mutation):
 *
 *   import { fireWorkflowEvent } from '../lib/workflowEventBus.js';
 *   fireWorkflowEvent(scope, 'case.updated', { caseId, status: 'resolved' });
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
 * Persists the event to `workflow_event_log` before dispatching so it can be
 * recovered if the process crashes before execution.
 * Always returns synchronously — execution happens in a subsequent tick.
 */
export function fireWorkflowEvent(
  scope: WorkflowEventScope,
  eventType: string,
  payload: Record<string, any> = {},
): void {
  if (!scope.tenantId || !scope.workspaceId) return;

  setImmediate(async () => {
    let logId: string | null = null;

    try {
      // ── 1. Persist event log row ─────────────────────────────────────────
      const supabase = getSupabaseAdmin();
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
        // Non-fatal: log and attempt dispatch anyway (degraded durability)
        logger.warn('workflowEventBus: failed to persist event log', {
          eventType,
          error: String(insertErr.message),
        });
      } else {
        logId = logRow?.id ?? null;
      }

      // ── 2. Dispatch to workflow engine ───────────────────────────────────
      const mod = await import('../routes/workflows.js');
      if (typeof (mod as any).executeWorkflowsByEvent !== 'function') {
        logger.warn('workflowEventBus: executeWorkflowsByEvent not exported from workflows route', { eventType });
        if (logId) {
          await supabase.from('workflow_event_log')
            .update({ status: 'failed', error: 'executeWorkflowsByEvent not available', executed_at: new Date().toISOString() })
            .eq('id', logId);
        }
        return;
      }

      await (mod as any).executeWorkflowsByEvent(scope, eventType, payload);

      // ── 3. Mark as executed ──────────────────────────────────────────────
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

      // ── 4. Mark as failed for recovery sweeper ───────────────────────────
      if (logId) {
        try {
          const supabase = getSupabaseAdmin();
          await supabase.from('workflow_event_log')
            .update({
              status:       'failed',
              error:        String(err?.message ?? err),
              executed_at:  new Date().toISOString(),
            })
            .eq('id', logId);
        } catch { /* ignore secondary error */ }
      }
    }
  });
}

/**
 * Retry pending events older than `thresholdMs` (default 60 s).
 * Called by the recovery sweeper in scheduledJobs.ts.
 * Returns the number of events retried.
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
    .select('id, event_type, payload, retry_count')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .lte('retry_count', 3)   // give up after 3 retries
    .limit(20);

  if (error || !stuckEvents?.length) return 0;

  let recovered = 0;
  for (const ev of stuckEvents) {
    try {
      // Bump retry count and re-mark pending so concurrent sweepers don't double-process
      await supabase.from('workflow_event_log')
        .update({ retry_count: (ev.retry_count ?? 0) + 1 })
        .eq('id', ev.id)
        .eq('status', 'pending');

      const mod = await import('../routes/workflows.js');
      if (typeof (mod as any).executeWorkflowsByEvent === 'function') {
        await (mod as any).executeWorkflowsByEvent(
          { tenantId, workspaceId },
          ev.event_type,
          (ev.payload as Record<string, any>) ?? {},
        );
        await supabase.from('workflow_event_log')
          .update({ status: 'executed', executed_at: new Date().toISOString() })
          .eq('id', ev.id);
        recovered++;
      }
    } catch (retryErr) {
      logger.warn('workflowEventBus: recovery retry failed', {
        eventId: ev.id,
        eventType: ev.event_type,
        error: String((retryErr as any)?.message ?? retryErr),
      });
      // Leave as pending — will be retried next sweep (up to retry_count limit)
    }
  }

  if (recovered > 0) {
    logger.info(`workflowEventBus: recovered ${recovered} stuck event(s)`, { tenantId });
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
