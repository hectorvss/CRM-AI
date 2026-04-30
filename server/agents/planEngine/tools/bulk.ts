/**
 * server/agents/planEngine/tools/bulk.ts
 *
 * Bulk-operation ToolSpecs. Apply a single mutation to N entities in one call.
 *
 * Why: when the user says "resolve all open cases for this customer" or
 * "cancel last week's pending orders", chaining N independent single-entity
 * tool calls inflates the plan and risks partial-failure thrashing. A bulk
 * tool batches the operation, surfaces per-id success/failure, and emits a
 * single audit event with the full set.
 *
 * Each bulk tool re-uses the underlying repository methods that the
 * single-entity tools call. Risk is set at the bulk level — bulk writes are
 * elevated by one notch (low → medium, medium → high) so policy can require
 * approval on broader actions.
 */

import {
  createCaseRepository,
  createCommerceRepository,
  createConversationRepository,
} from '../../../data/index.js';
import { integrationRegistry } from '../../../integrations/registry.js';
import type { WritableOrders } from '../../../integrations/types.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import { logger } from '../../../utils/logger.js';

const caseRepo = createCaseRepository();
const commerceRepo = createCommerceRepository();
const conversationRepo = createConversationRepository();

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_BULK_SIZE = 100;

interface BulkResult<T = unknown> {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error?: string; value?: T }>;
}

async function runBulk<TArgs extends { id: string }, TVal>(
  ids: string[],
  build: (id: string) => TArgs,
  exec: (args: TArgs) => Promise<{ ok: boolean; value?: TVal; error?: string }>,
): Promise<BulkResult<TVal>> {
  const results: BulkResult<TVal>['results'] = [];
  let succeeded = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      const r = await exec(build(id));
      if (r.ok) {
        succeeded += 1;
        results.push({ id, ok: true, value: r.value });
      } else {
        failed += 1;
        results.push({ id, ok: false, error: r.error });
      }
    } catch (err) {
      failed += 1;
      results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { total: ids.length, succeeded, failed, results };
}

// ── case.bulk_update_status ──────────────────────────────────────────────────

const CASE_STATUS_VALUES = ['open', 'pending', 'resolved', 'closed', 'escalated'] as const;
type CaseStatus = typeof CASE_STATUS_VALUES[number];

interface CaseBulkUpdateStatusArgs {
  caseIds: string[];
  status: CaseStatus;
  reason?: string;
}

export const caseBulkUpdateStatusTool: ToolSpec<CaseBulkUpdateStatusArgs, unknown> = {
  name: 'case.bulk_update_status',
  version: '1.0.0',
  description:
    'Update the status of MULTIPLE support cases in one call. Use when the user requests an action over several cases at once ' +
    '(e.g. "resolve all open cases of this customer"). Returns per-id success/failure.',
  category: 'case',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseIds: s.array(s.string(), {
      min: 1,
      max: MAX_BULK_SIZE,
      description: `Array of case UUIDs (1..${MAX_BULK_SIZE})`,
    }),
    status: s.enum(CASE_STATUS_VALUES, { description: 'New status to apply to every listed case' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason recorded in audit + status history' }),
  }),
  returns: s.any('{ total, succeeded, failed, results: [{ id, ok, error? }] }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return {
        ok: true,
        value: { total: args.caseIds.length, succeeded: args.caseIds.length, failed: 0, results: args.caseIds.map((id) => ({ id, ok: true, value: { dryRun: true } })) },
      };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    const summary = await runBulk(
      args.caseIds,
      (id) => ({ id }),
      async ({ id }) => {
        const bundle = await caseRepo.getBundle(scope, id);
        if (!bundle) return { ok: false, error: 'Case not found' };
        await caseRepo.update(scope, id, { status: args.status, last_activity_at: new Date().toISOString() });
        await caseRepo.addStatusHistory(scope, {
          caseId: id,
          fromStatus: bundle.case.status,
          toStatus: args.status,
          changedBy: context.userId ?? 'system',
          reason: args.reason ?? null,
        });
        return { ok: true, value: { id, status: args.status } };
      },
    );

    await context.audit({
      action: 'PLAN_ENGINE_CASE_BULK_STATUS_UPDATE',
      entityType: 'case',
      newValue: { status: args.status, reason: args.reason ?? null, total: summary.total, succeeded: summary.succeeded, failed: summary.failed },
      metadata: { source: 'plan-engine', planId: context.planId, caseIds: args.caseIds },
    });

    return { ok: true, value: summary };
  },
};

// ── case.bulk_update_priority ────────────────────────────────────────────────

const PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
type CasePriority = typeof PRIORITY_VALUES[number];

interface CaseBulkUpdatePriorityArgs {
  caseIds: string[];
  priority: CasePriority;
  reason?: string;
}

export const caseBulkUpdatePriorityTool: ToolSpec<CaseBulkUpdatePriorityArgs, unknown> = {
  name: 'case.bulk_update_priority',
  version: '1.0.0',
  description: 'Change the priority of MULTIPLE support cases in one call. Returns per-id success/failure.',
  category: 'case',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseIds: s.array(s.string(), { min: 1, max: MAX_BULK_SIZE, description: `Array of case UUIDs (1..${MAX_BULK_SIZE})` }),
    priority: s.enum(PRIORITY_VALUES, { description: 'New priority level' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason for the priority change' }),
  }),
  returns: s.any('{ total, succeeded, failed, results: [{ id, ok, error? }] }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return {
        ok: true,
        value: { total: args.caseIds.length, succeeded: args.caseIds.length, failed: 0, results: args.caseIds.map((id) => ({ id, ok: true, value: { dryRun: true } })) },
      };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    const summary = await runBulk(
      args.caseIds,
      (id) => ({ id }),
      async ({ id }) => {
        const bundle = await caseRepo.getBundle(scope, id);
        if (!bundle) return { ok: false, error: 'Case not found' };
        await caseRepo.update(scope, id, { priority: args.priority, last_activity_at: new Date().toISOString() });
        return { ok: true, value: { id, priority: args.priority } };
      },
    );

    await context.audit({
      action: 'PLAN_ENGINE_CASE_BULK_PRIORITY_UPDATE',
      entityType: 'case',
      newValue: { priority: args.priority, reason: args.reason ?? null, total: summary.total, succeeded: summary.succeeded, failed: summary.failed },
      metadata: { source: 'plan-engine', planId: context.planId, caseIds: args.caseIds },
    });

    return { ok: true, value: summary };
  },
};

// ── case.bulk_assign ─────────────────────────────────────────────────────────

interface CaseBulkAssignArgs {
  caseIds: string[];
  assignedUserId?: string;
  assignedTeamId?: string;
  reason?: string;
}

export const caseBulkAssignTool: ToolSpec<CaseBulkAssignArgs, unknown> = {
  name: 'case.bulk_assign',
  version: '1.0.0',
  description:
    'Reassign MULTIPLE cases to a user or team in one call. Provide at least one of assignedUserId or assignedTeamId.',
  category: 'case',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseIds: s.array(s.string(), { min: 1, max: MAX_BULK_SIZE, description: `Array of case UUIDs (1..${MAX_BULK_SIZE})` }),
    assignedUserId: s.string({ required: false, description: 'UUID of user to assign cases to (empty string to unassign)' }),
    assignedTeamId: s.string({ required: false, description: 'UUID of team to assign cases to (empty string to unassign)' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason for the bulk reassignment' }),
  }),
  returns: s.any('{ total, succeeded, failed, results: [{ id, ok, error? }] }'),
  async run({ args, context }) {
    if (!args.assignedUserId && !args.assignedTeamId) {
      return { ok: false, error: 'Provide at least one of assignedUserId or assignedTeamId', errorCode: 'INVALID_ARGS' };
    }

    if (context.dryRun) {
      return {
        ok: true,
        value: { total: args.caseIds.length, succeeded: args.caseIds.length, failed: 0, results: args.caseIds.map((id) => ({ id, ok: true, value: { dryRun: true } })) },
      };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    const summary = await runBulk(
      args.caseIds,
      (id) => ({ id }),
      async ({ id }) => {
        const bundle = await caseRepo.getBundle(scope, id);
        if (!bundle) return { ok: false, error: 'Case not found' };
        const updates: Record<string, any> = { last_activity_at: new Date().toISOString() };
        if (args.assignedUserId !== undefined) updates.assigned_user_id = args.assignedUserId || null;
        if (args.assignedTeamId !== undefined) updates.assigned_team_id = args.assignedTeamId || null;
        await caseRepo.update(scope, id, updates);
        return { ok: true, value: { id } };
      },
    );

    await context.audit({
      action: 'PLAN_ENGINE_CASE_BULK_ASSIGNMENT',
      entityType: 'case',
      newValue: {
        assignedUserId: args.assignedUserId ?? null,
        assignedTeamId: args.assignedTeamId ?? null,
        reason: args.reason ?? null,
        total: summary.total,
        succeeded: summary.succeeded,
        failed: summary.failed,
      },
      metadata: { source: 'plan-engine', planId: context.planId, caseIds: args.caseIds },
    });

    return { ok: true, value: summary };
  },
};

// ── case.bulk_add_note ───────────────────────────────────────────────────────

interface CaseBulkAddNoteArgs {
  caseIds: string[];
  content: string;
}

export const caseBulkAddNoteTool: ToolSpec<CaseBulkAddNoteArgs, unknown> = {
  name: 'case.bulk_add_note',
  version: '1.0.0',
  description:
    'Append the same internal note to MULTIPLE cases. Useful when broadcasting a status update or context across related cases.',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseIds: s.array(s.string(), { min: 1, max: MAX_BULK_SIZE, description: `Array of case UUIDs (1..${MAX_BULK_SIZE})` }),
    content: s.string({ min: 1, max: 5000, description: 'Internal note text appended to every listed case' }),
  }),
  returns: s.any('{ total, succeeded, failed, results: [{ id, ok, error? }] }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return {
        ok: true,
        value: { total: args.caseIds.length, succeeded: args.caseIds.length, failed: 0, results: args.caseIds.map((id) => ({ id, ok: true, value: { dryRun: true } })) },
      };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    const summary = await runBulk(
      args.caseIds,
      (id) => ({ id }),
      async ({ id }) => {
        const bundle = await caseRepo.getBundle(scope, id);
        if (!bundle) return { ok: false, error: 'Case not found' };
        await conversationRepo.createInternalNote(scope, {
          caseId: id,
          content: args.content,
          createdBy: context.userId ?? 'system',
        });
        return { ok: true, value: { id, noteCreated: true } };
      },
    );

    await context.audit({
      action: 'PLAN_ENGINE_CASE_BULK_NOTE',
      entityType: 'case',
      newValue: { contentLength: args.content.length, total: summary.total, succeeded: summary.succeeded, failed: summary.failed },
      metadata: { source: 'plan-engine', planId: context.planId, caseIds: args.caseIds },
    });

    return { ok: true, value: summary };
  },
};

// ── order.bulk_cancel ────────────────────────────────────────────────────────

interface OrderBulkCancelArgs {
  orderIds: string[];
  reason?: string;
}

export const orderBulkCancelTool: ToolSpec<OrderBulkCancelArgs, unknown> = {
  name: 'order.bulk_cancel',
  version: '1.0.0',
  description:
    'Cancel MULTIPLE orders in one call. High-risk operation — every cancellation goes through the same Shopify+DB path as ' +
    'the single-entity tool. Returns per-id success/failure.',
  category: 'order',
  sideEffect: 'write',
  risk: 'critical',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    orderIds: s.array(s.string(), { min: 1, max: MAX_BULK_SIZE, description: `Array of order UUIDs (1..${MAX_BULK_SIZE})` }),
    reason: s.string({ required: false, max: 500, description: 'Reason recorded in audit log for every cancellation' }),
  }),
  returns: s.any('{ total, succeeded, failed, results: [{ id, ok, error? }] }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return {
        ok: true,
        value: { total: args.orderIds.length, succeeded: args.orderIds.length, failed: 0, results: args.orderIds.map((id) => ({ id, ok: true, value: { dryRun: true } })) },
      };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const reason = args.reason ?? 'Cancelled via Super Agent (bulk)';
    const shopifyAdapter = integrationRegistry.get('shopify') as unknown as (WritableOrders & { cancelOrder: any }) | null;

    const summary = await runBulk(
      args.orderIds,
      (id) => ({ id }),
      async ({ id }) => {
        const order = await commerceRepo.getOrder(scope, id) as any;
        if (!order) return { ok: false, error: 'Order not found' };

        let executedVia: 'shopify' | 'db-only' = 'db-only';
        const externalOrderId: string | null = order.external_order_id ?? order.shopify_id ?? null;
        if (shopifyAdapter && typeof shopifyAdapter.cancelOrder === 'function' && externalOrderId) {
          try {
            await shopifyAdapter.cancelOrder({ orderExternalId: externalOrderId, reason, email: true, restock: true });
            executedVia = 'shopify';
          } catch (shopifyErr) {
            logger.warn('order.bulk_cancel: Shopify call failed, continuing with DB-only update', {
              orderId: id,
              error: String(shopifyErr instanceof Error ? shopifyErr.message : shopifyErr),
            });
          }
        }

        await commerceRepo.updateOrder(scope, id, {
          status: 'cancelled',
          fulfillment_status: order.fulfillment_status ?? 'not_fulfilled',
          approval_status: 'not_required',
          recommended_action: 'No further action needed',
          last_update: reason,
          system_states: { ...(order.system_states ?? {}), canonical: 'cancelled', crm_ai: 'cancelled' },
        });

        return { ok: true, value: { id, status: 'cancelled', executedVia } };
      },
    );

    await context.audit({
      action: 'PLAN_ENGINE_ORDER_BULK_CANCELLED',
      entityType: 'order',
      newValue: { reason, total: summary.total, succeeded: summary.succeeded, failed: summary.failed },
      metadata: { source: 'plan-engine', planId: context.planId, orderIds: args.orderIds },
    });

    return { ok: true, value: summary };
  },
};
