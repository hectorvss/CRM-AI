/**
 * server/lib/workflowEventBus.ts
 *
 * Central event bus that connects SaaS domain mutations to the workflow engine.
 *
 * Design decisions:
 *  - Fire-and-forget via setImmediate: the HTTP response is never blocked.
 *  - Lazy import of executeWorkflowsByEvent avoids circular dependencies at startup
 *    (routes/workflows.ts → this file → routes/workflows.ts would be circular).
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

export interface WorkflowEventScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

/**
 * Fire a business event that may trigger one or more published workflows.
 * Always returns synchronously — execution happens in a subsequent tick.
 */
export function fireWorkflowEvent(
  scope: WorkflowEventScope,
  eventType: string,
  payload: Record<string, any> = {},
): void {
  if (!scope.tenantId || !scope.workspaceId) return;

  setImmediate(async () => {
    try {
      // Lazy import prevents circular-dep issues at module load time
      const mod = await import('../routes/workflows.js');
      if (typeof (mod as any).executeWorkflowsByEvent !== 'function') {
        logger.warn('workflowEventBus: executeWorkflowsByEvent not exported from workflows route', { eventType });
        return;
      }
      await (mod as any).executeWorkflowsByEvent(scope, eventType, payload);
    } catch (err: any) {
      logger.warn('workflowEventBus: dispatch failed', {
        eventType,
        tenantId: scope.tenantId,
        error: String(err?.message ?? err),
      });
    }
  });
}
