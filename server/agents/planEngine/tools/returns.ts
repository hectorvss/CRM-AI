/**
 * server/agents/planEngine/tools/returns.ts
 */

import { createCommerceRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const commerceRepo = createCommerceRepository();

// ── return.get ────────────────────────────────────────────────────────────────

export const returnGetTool: ToolSpec<{ returnId: string }, unknown> = {
  name: 'return.get',
  version: '1.0.0',
  description: 'Retrieve a single return request by ID including status, reason, and linked order/payment.',
  category: 'return',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({ returnId: s.string({ description: 'UUID of the return' }) }),
  returns: s.any('Full return context object'),
  async run({ args, context }) {
    const ret = await commerceRepo.getReturn(
      { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
      args.returnId,
    );
    if (!ret) return { ok: false, error: 'Return not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: ret };
  },
};

// ── return.list ───────────────────────────────────────────────────────────────

export const returnListTool: ToolSpec<{ status?: string; limit?: number }, unknown> = {
  name: 'return.list',
  version: '1.0.0',
  description: 'List return requests, optionally filtered by status. Returns up to `limit` results (default 20).',
  category: 'return',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    status: s.string({ required: false, description: 'Filter by status (e.g. pending, approved, rejected, refunded)' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of return objects'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const filters: { status?: string } = {};
    if (args.status) filters.status = args.status;
    const all = await commerceRepo.listReturns(scope, filters);
    return { ok: true, value: all.slice(0, args.limit ?? 20) };
  },
};

// ── return.approve ────────────────────────────────────────────────────────────

export const returnApproveTool: ToolSpec<{ returnId: string; reason?: string }, unknown> = {
  name: 'return.approve',
  version: '1.0.0',
  description: 'Approve a pending return request.',
  category: 'return',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    returnId: s.string({ description: 'UUID of the return to approve' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason or note' }),
  }),
  returns: s.any('{ returnId, status: "approved" }'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { returnId: args.returnId, status: 'approved', dryRun: true } };
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const ret = await commerceRepo.getReturn(scope, args.returnId);
    if (!ret) return { ok: false, error: 'Return not found', errorCode: 'NOT_FOUND' };
    await commerceRepo.updateReturn(scope, args.returnId, {
      status: 'approved',
      resolution_notes: args.reason ?? 'Approved via Super Agent',
      updated_at: new Date().toISOString(),
    });
    await context.audit({
      action: 'PLAN_ENGINE_RETURN_APPROVED',
      entityType: 'return',
      entityId: args.returnId,
      oldValue: { status: (ret as any).status },
      newValue: { status: 'approved', reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return { ok: true, value: { returnId: args.returnId, status: 'approved' } };
  },
};

// ── return.reject ─────────────────────────────────────────────────────────────

export const returnRejectTool: ToolSpec<{ returnId: string; reason: string }, unknown> = {
  name: 'return.reject',
  version: '1.0.0',
  description: 'Reject a pending return request. Reason is required.',
  category: 'return',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    returnId: s.string({ description: 'UUID of the return to reject' }),
    reason: s.string({ min: 5, max: 500, description: 'Reason for rejection (required, shown in audit log)' }),
  }),
  returns: s.any('{ returnId, status: "rejected" }'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { returnId: args.returnId, status: 'rejected', dryRun: true } };
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const ret = await commerceRepo.getReturn(scope, args.returnId);
    if (!ret) return { ok: false, error: 'Return not found', errorCode: 'NOT_FOUND' };
    await commerceRepo.updateReturn(scope, args.returnId, {
      status: 'rejected',
      resolution_notes: args.reason,
      updated_at: new Date().toISOString(),
    });
    await context.audit({
      action: 'PLAN_ENGINE_RETURN_REJECTED',
      entityType: 'return',
      entityId: args.returnId,
      oldValue: { status: (ret as any).status },
      newValue: { status: 'rejected', reason: args.reason },
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return { ok: true, value: { returnId: args.returnId, status: 'rejected' } };
  },
};
