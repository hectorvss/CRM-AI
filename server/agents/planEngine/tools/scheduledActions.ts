/**
 * server/agents/planEngine/tools/scheduledActions.ts
 *
 * Time-aware / scheduled action tools.
 *
 * These tools let the LLM create reminders, delayed messages, and delayed
 * workflow / agent triggers without leaving the Super Agent transcript.
 */

import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import { createSuperAgentOpsRepository } from '../../../data/superAgentOps.js';
import { createAuditRepository } from '../../../data/index.js';

const opsRepo = createSuperAgentOpsRepository();
const auditRepo = createAuditRepository();
const SCHEDULED_ACTION_KIND_VALUES = ['reminder', 'message', 'workflow', 'agent'] as const;
const SCHEDULED_ACTION_STATUS_VALUES = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'all'] as const;

type ScheduledActionCreateArgs = {
  title: string;
  kind: 'reminder' | 'message' | 'workflow' | 'agent';
  dueAt?: string;
  delayMinutes?: number;
  targetType?: string;
  targetId?: string;
  note?: string;
  payload?: Record<string, unknown>;
  dispatchJobType?: string;
  dispatchPayload?: Record<string, unknown>;
  workflowId?: string;
};

type ScheduledActionListArgs = {
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'all';
  limit?: number;
};

type ScheduledActionCancelArgs = {
  id: string;
};

function scope(context: { tenantId: string; workspaceId: string | null }) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId ?? '',
  };
}

function resolveDueAt(args: ScheduledActionCreateArgs) {
  if (args.dueAt) return args.dueAt;
  const minutes = Math.max(1, Math.round(args.delayMinutes ?? 60));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export const scheduledActionCreateTool: ToolSpec<ScheduledActionCreateArgs, unknown> = {
  name: 'scheduled_action.create',
  version: '1.0.0',
  description:
    'Create a scheduled action or reminder that will run later. Use this when the user asks for follow-up tomorrow, next week, or at a specific time.',
  category: 'system',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    title: s.string({ min: 1, max: 200, description: 'Human readable title for the scheduled action' }),
    kind: s.enum(SCHEDULED_ACTION_KIND_VALUES, { description: 'Scheduled action type' }),
    dueAt: s.string({ required: false, description: 'Absolute ISO timestamp. If omitted, delayMinutes is used.' }),
    delayMinutes: s.number({ required: false, integer: true, min: 1, max: 10080, description: 'Delay in minutes when dueAt is not provided' }),
    targetType: s.string({ required: false, description: 'Entity type the action is attached to' }),
    targetId: s.string({ required: false, description: 'Entity id the action is attached to' }),
    note: s.string({ required: false, max: 4000, description: 'Human readable reminder or scheduled note' }),
    payload: s.object({}, { required: false, description: 'Custom payload stored with the scheduled action' }),
    dispatchJobType: s.string({ required: false, description: 'Optional queue job type to enqueue when the action matures' }),
    dispatchPayload: s.object({}, { required: false, description: 'Payload for the dispatch job when the action matures' }),
    workflowId: s.string({ required: false, description: 'Workflow id to trigger when the action matures' }),
  }),
  returns: s.any('Scheduled action record'),
  async run({ args, context }) {
    const dueAt = resolveDueAt(args);
    const record = await opsRepo.createScheduledAction(scope(context), {
      title: args.title,
      kind: args.kind,
      dueAt,
      targetType: args.targetType ?? null,
      targetId: args.targetId ?? null,
      payload: {
        ...((args.payload || {}) as Record<string, unknown>),
        note: args.note ?? null,
        dispatchJobType: args.dispatchJobType ?? null,
        dispatchPayload: args.dispatchPayload ?? null,
        workflowId: args.workflowId ?? null,
        source: 'plan-engine',
        planId: context.planId,
      },
      createdBy: context.userId ?? null,
      sessionId: null,
      runId: null,
    });

    await auditRepo.log({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId ?? '',
      actorId: context.userId ?? 'system',
      action: 'SUPER_AGENT_SCHEDULED_ACTION_CREATED',
      entityType: args.targetType || 'super_agent',
      entityId: args.targetId || record.id,
      newValue: {
        title: args.title,
        kind: args.kind,
        dueAt,
        dispatchJobType: args.dispatchJobType ?? null,
        workflowId: args.workflowId ?? null,
      },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        id: record.id,
        title: record.title,
        kind: record.kind,
        dueAt: record.due_at,
        status: record.status,
        targetType: record.target_type,
        targetId: record.target_id,
        payload: record.payload,
      },
    };
  },
};

export const scheduledActionListTool: ToolSpec<ScheduledActionListArgs, unknown> = {
  name: 'scheduled_action.list',
  version: '1.0.0',
  description: 'List scheduled actions and reminders for the current workspace.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    status: s.enum(SCHEDULED_ACTION_STATUS_VALUES, { required: false, description: 'Filter by status' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Maximum number of scheduled actions to return' }),
  }),
  returns: s.any('Scheduled action list'),
  async run({ args, context }) {
    const rows = await opsRepo.listScheduledActions(scope(context), {
      status: args.status ?? 'all',
      limit: args.limit ?? 25,
    });
    return { ok: true, value: rows };
  },
};

export const scheduledActionCancelTool: ToolSpec<ScheduledActionCancelArgs, unknown> = {
  name: 'scheduled_action.cancel',
  version: '1.0.0',
  description: 'Cancel a scheduled action or reminder.',
  category: 'system',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    id: s.string({ min: 1, description: 'Scheduled action id' }),
  }),
  returns: s.any('Cancelled scheduled action'),
  async run({ args, context }) {
    await opsRepo.cancelScheduledAction(scope(context), args.id);
    await auditRepo.log({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId ?? '',
      actorId: context.userId ?? 'system',
      action: 'SUPER_AGENT_SCHEDULED_ACTION_CANCELLED',
      entityType: 'super_agent',
      entityId: args.id,
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return { ok: true, value: { id: args.id, status: 'cancelled' } };
  },
};
