/**
 * server/agents/planEngine/tools/approvals.ts
 */

import { createApprovalRepository, createAuditRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const approvalRepo = createApprovalRepository();
const auditRepo = createAuditRepository();

type ApprovalScope = { tenantId: string; workspaceId: string; userId?: string };

// ── approval.get ──────────────────────────────────────────────────────────────

export const approvalGetTool: ToolSpec<{ approvalId: string }, unknown> = {
  name: 'approval.get',
  version: '1.0.0',
  description: 'Retrieve an approval request by ID including action type, risk level, evidence, and current status.',
  category: 'approval',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'approvals.read',
  args: s.object({ approvalId: s.string({ description: 'UUID of the approval request' }) }),
  returns: s.any('Full approval object'),
  async run({ args, context }) {
    const scope: ApprovalScope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '', userId: context.userId ?? undefined };
    const approval = await approvalRepo.get(scope, args.approvalId);
    if (!approval) return { ok: false, error: 'Approval not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: approval };
  },
};

// ── approval.list ─────────────────────────────────────────────────────────────

export const approvalListTool: ToolSpec<{ status?: string; limit?: number }, unknown> = {
  name: 'approval.list',
  version: '1.0.0',
  description: 'List approval requests. Filter by status (pending, approved, rejected). Default: pending approvals.',
  category: 'approval',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'approvals.read',
  args: s.object({
    status: s.string({ required: false, description: 'Filter status: pending | approved | rejected' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of approval objects'),
  async run({ args, context }) {
    const scope: ApprovalScope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const filters = { status: args.status ?? 'pending' };
    const all = await approvalRepo.list(scope, filters);
    return { ok: true, value: (all as any[]).slice(0, args.limit ?? 20) };
  },
};

// ── approval.decide ───────────────────────────────────────────────────────────

const DECISION_VALUES = ['approved', 'rejected'] as const;

export const approvalDecideTool: ToolSpec<{
  approvalId: string;
  decision: 'approved' | 'rejected';
  note?: string;
}, unknown> = {
  name: 'approval.decide',
  version: '1.0.0',
  description: 'Approve or reject a pending approval request. Only users with approvals.decide permission can call this.',
  category: 'approval',
  sideEffect: 'write',
  risk: 'high',
  idempotent: false,
  requiredPermission: 'approvals.decide',
  args: s.object({
    approvalId: s.string({ description: 'UUID of the approval to decide' }),
    decision: s.enum(DECISION_VALUES, { description: 'approved or rejected' }),
    note: s.string({ required: false, max: 1000, description: 'Optional note explaining the decision' }),
  }),
  returns: s.any('{ approvalId, decision, caseId? }'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { approvalId: args.approvalId, decision: args.decision, dryRun: true } };
    const scope: ApprovalScope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '', userId: context.userId ?? undefined };
    const approval = await approvalRepo.get(scope, args.approvalId);
    if (!approval) return { ok: false, error: 'Approval not found', errorCode: 'NOT_FOUND' };
    const result = await approvalRepo.decide(scope, args.approvalId, {
      decision: args.decision,
      note: args.note ?? null,
      decided_by: context.userId ?? 'system',
    });
    await context.audit({
      action: 'PLAN_ENGINE_APPROVAL_DECIDED',
      entityType: 'approval',
      entityId: args.approvalId,
      oldValue: { status: (approval as any).status },
      newValue: { status: args.decision, note: args.note ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return {
      ok: true,
      value: {
        approvalId: args.approvalId,
        decision: args.decision,
        caseId: (result as any)?.caseId ?? (approval as any).case_id ?? null,
      },
    };
  },
};
