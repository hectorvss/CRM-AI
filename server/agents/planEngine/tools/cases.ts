/**
 * server/agents/planEngine/tools/cases.ts
 *
 * ToolSpecs for case operations.
 */

import {
  createCaseRepository,
  createConversationRepository,
} from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import type { CaseFilters } from '../../../data/cases.js';

const caseRepo = createCaseRepository();
const conversationRepo = createConversationRepository();

// ── case.get ─────────────────────────────────────────────────────────────────

interface CaseGetArgs {
  caseId: string;
}

export const caseGetTool: ToolSpec<CaseGetArgs, unknown> = {
  name: 'case.get',
  version: '1.0.0',
  description: 'Retrieve a support case by ID including status, customer, linked orders, and conversation summary.',
  category: 'case',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case to fetch' }),
  }),
  returns: s.any('Case bundle (case + customer + linked entities)'),
  async run({ args, context }) {
    const bundle = await caseRepo.getBundle(
      { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
      args.caseId,
    );
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: bundle };
  },
};

// ── case.update_status ───────────────────────────────────────────────────────

const CASE_STATUS_VALUES = ['open', 'pending', 'resolved', 'closed', 'escalated'] as const;
type CaseStatus = typeof CASE_STATUS_VALUES[number];

interface CaseUpdateStatusArgs {
  caseId: string;
  status: CaseStatus;
  reason?: string;
}

export const caseUpdateStatusTool: ToolSpec<CaseUpdateStatusArgs, unknown> = {
  name: 'case.update_status',
  version: '1.0.0',
  description: 'Update the status of a support case (open → pending → resolved → closed, or escalated).',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case to update' }),
    status: s.enum(CASE_STATUS_VALUES, { description: 'New status' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason / note for the status change' }),
  }),
  returns: s.any('{ caseId, status }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { caseId: args.caseId, status: args.status, dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const bundle = await caseRepo.getBundle(scope, args.caseId);
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };

    await caseRepo.update(scope, args.caseId, {
      status: args.status,
      last_activity_at: new Date().toISOString(),
    });

    await caseRepo.addStatusHistory(scope, {
      caseId: args.caseId,
      fromStatus: bundle.case.status,
      toStatus: args.status,
      changedBy: context.userId ?? 'system',
      reason: args.reason ?? null,
    });

    await context.audit({
      action: 'PLAN_ENGINE_CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: args.caseId,
      oldValue: { status: bundle.case.status },
      newValue: { status: args.status, reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return { ok: true, value: { caseId: args.caseId, status: args.status } };
  },
};

// ── case.add_note ─────────────────────────────────────────────────────────────

interface CaseAddNoteArgs {
  caseId: string;
  content: string;
}

export const caseAddNoteTool: ToolSpec<CaseAddNoteArgs, unknown> = {
  name: 'case.add_note',
  version: '1.0.0',
  description: 'Add an internal note to a case. Visible to agents only, not to the customer.',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case' }),
    content: s.string({ min: 1, max: 5000, description: 'Internal note text' }),
  }),
  returns: s.any('{ caseId, noteCreated: true }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { caseId: args.caseId, noteCreated: true, dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const bundle = await caseRepo.getBundle(scope, args.caseId);
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };

    await conversationRepo.createInternalNote(scope, {
      caseId: args.caseId,
      content: args.content,
      createdBy: context.userId ?? 'system',
    });

    // Also append to conversation thread if one exists
    const conversation = await conversationRepo.ensureForCase(scope, bundle.case);
    if (conversation) {
      await conversationRepo.appendMessage(scope, {
        conversationId: conversation.id,
        caseId: args.caseId,
        customerId: bundle.case.customer_id ?? null,
        type: 'internal',
        direction: 'outbound',
        senderId: context.userId ?? 'system',
        senderName: 'Super Agent',
        content: args.content,
        channel: 'internal',
      });
    }

    await context.audit({
      action: 'PLAN_ENGINE_CASE_NOTE_ADDED',
      entityType: 'case',
      entityId: args.caseId,
      metadata: { source: 'plan-engine', planId: context.planId, contentLength: args.content.length },
    });

    return { ok: true, value: { caseId: args.caseId, noteCreated: true } };
  },
};

// ── case.list ─────────────────────────────────────────────────────────────────

interface CaseListArgs {
  status?: string;
  priority?: string;
  riskLevel?: string;
  q?: string;
  assignedUserId?: string;
  limit?: number;
}

export const caseListTool: ToolSpec<CaseListArgs, unknown> = {
  name: 'case.list',
  version: '1.0.0',
  description:
    'Search and list support cases. Filter by status, priority, risk level, assigned user, or free-text query ' +
    '(searches case number, customer name, and email). Returns up to `limit` results ordered by recent activity.',
  category: 'case',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    status: s.string({ required: false, description: 'Filter by status: open, pending, resolved, closed, escalated' }),
    priority: s.string({ required: false, description: 'Filter by priority: low, medium, high, critical' }),
    riskLevel: s.string({ required: false, description: 'Filter by risk level: low, medium, high' }),
    q: s.string({ required: false, description: 'Free-text search query (case number, customer name, email)' }),
    assignedUserId: s.string({ required: false, description: 'Filter by assigned user UUID' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of case summaries with customer, linked entity counts, and SLA status'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const filters: CaseFilters = {};
    if (args.status) filters.status = args.status;
    if (args.priority) filters.priority = args.priority;
    if (args.riskLevel) filters.risk_level = args.riskLevel;
    if (args.q) filters.q = args.q;
    if (args.assignedUserId) filters.assigned_user_id = args.assignedUserId;

    const cases = await caseRepo.list(scope, filters);
    return { ok: true, value: (cases as any[]).slice(0, args.limit ?? 20) };
  },
};

// ── case.update_priority ──────────────────────────────────────────────────────

const PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
type CasePriority = typeof PRIORITY_VALUES[number];

interface CaseUpdatePriorityArgs {
  caseId: string;
  priority: CasePriority;
  reason?: string;
}

export const caseUpdatePriorityTool: ToolSpec<CaseUpdatePriorityArgs, unknown> = {
  name: 'case.update_priority',
  version: '1.0.0',
  description: 'Change the priority of a support case (low / medium / high / critical).',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case to update' }),
    priority: s.enum(PRIORITY_VALUES, { description: 'New priority level' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason for the priority change' }),
  }),
  returns: s.any('{ caseId, priority }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { caseId: args.caseId, priority: args.priority, dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const bundle = await caseRepo.getBundle(scope, args.caseId);
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };

    await caseRepo.update(scope, args.caseId, {
      priority: args.priority,
      last_activity_at: new Date().toISOString(),
    });

    await context.audit({
      action: 'PLAN_ENGINE_CASE_PRIORITY_UPDATE',
      entityType: 'case',
      entityId: args.caseId,
      oldValue: { priority: bundle.case.priority },
      newValue: { priority: args.priority, reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return { ok: true, value: { caseId: args.caseId, priority: args.priority } };
  },
};

// ── case.update_assignment ────────────────────────────────────────────────────

interface CaseUpdateAssignmentArgs {
  caseId: string;
  assignedUserId?: string;
  assignedTeamId?: string;
  reason?: string;
}

export const caseUpdateAssignmentTool: ToolSpec<CaseUpdateAssignmentArgs, unknown> = {
  name: 'case.update_assignment',
  version: '1.0.0',
  description:
    'Reassign a support case to a different user or team. ' +
    'Provide at least one of assignedUserId or assignedTeamId. ' +
    'To unassign, pass empty string for the relevant field.',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case to reassign' }),
    assignedUserId: s.string({ required: false, description: 'UUID of the user to assign the case to' }),
    assignedTeamId: s.string({ required: false, description: 'UUID of the team to assign the case to' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason for the reassignment' }),
  }),
  returns: s.any('{ caseId, assignedUserId, assignedTeamId }'),
  async run({ args, context }) {
    if (!args.assignedUserId && !args.assignedTeamId) {
      return { ok: false, error: 'Provide at least one of assignedUserId or assignedTeamId', errorCode: 'INVALID_ARGS' };
    }

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          caseId: args.caseId,
          assignedUserId: args.assignedUserId ?? null,
          assignedTeamId: args.assignedTeamId ?? null,
          dryRun: true,
        },
      };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const bundle = await caseRepo.getBundle(scope, args.caseId);
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };

    const updates: Record<string, any> = { last_activity_at: new Date().toISOString() };
    if (args.assignedUserId !== undefined) updates.assigned_user_id = args.assignedUserId || null;
    if (args.assignedTeamId !== undefined) updates.assigned_team_id = args.assignedTeamId || null;

    await caseRepo.update(scope, args.caseId, updates);

    await context.audit({
      action: 'PLAN_ENGINE_CASE_ASSIGNMENT_UPDATE',
      entityType: 'case',
      entityId: args.caseId,
      oldValue: { assigned_user_id: bundle.case.assigned_user_id, assigned_team_id: bundle.case.assigned_team_id },
      newValue: { ...updates, reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        caseId: args.caseId,
        assignedUserId: args.assignedUserId ?? null,
        assignedTeamId: args.assignedTeamId ?? null,
      },
    };
  },
};
