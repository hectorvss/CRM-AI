/**
 * server/agents/planEngine/tools/feedback.ts
 *
 * Records operator feedback on Super Agent suggestions.
 *
 * The goal is not to "train" a model directly here, but to capture the
 * operator's decision trail in a structured way so future recommendation and
 * analytics layers can learn from approval / rejection patterns.
 */

import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import { createSuperAgentOpsRepository } from '../../../data/superAgentOps.js';
import { createAuditRepository } from '../../../data/index.js';

const opsRepo = createSuperAgentOpsRepository();
const auditRepo = createAuditRepository();
const FEEDBACK_DECISION_VALUES = ['approve', 'reject', 'override'] as const;

type FeedbackArgs = {
  sessionId?: string;
  runId?: string;
  targetType?: string;
  targetId?: string;
  tool?: string;
  decision: 'approve' | 'reject' | 'override';
  accepted: boolean;
  rationale?: string;
  note?: string;
};

type FeedbackListArgs = {
  limit?: number;
};

function scope(context: { tenantId: string; workspaceId: string | null }) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId ?? '',
  };
}

export const feedbackRecordDecisionTool: ToolSpec<FeedbackArgs, unknown> = {
  name: 'feedback.record_decision',
  version: '1.0.0',
  description:
    'Record whether the operator approved, rejected, or overrode a Super Agent recommendation. ' +
    'This powers future recommendation analytics and keeps the approval/rejection loop auditable.',
  category: 'system',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    sessionId: s.string({ required: false, description: 'Super Agent session id' }),
    runId: s.string({ required: false, description: 'Super Agent run id' }),
    targetType: s.string({ required: false, description: 'Entity type impacted by the recommendation' }),
    targetId: s.string({ required: false, description: 'Entity id impacted by the recommendation' }),
    tool: s.string({ required: false, description: 'Tool or action name that was accepted/rejected' }),
    decision: s.enum(FEEDBACK_DECISION_VALUES, { description: 'How the operator handled the recommendation' }),
    accepted: s.boolean({ description: 'Whether the recommendation was accepted' }),
    rationale: s.string({ required: false, max: 2000, description: 'Reason entered by the operator' }),
    note: s.string({ required: false, max: 2000, description: 'Optional extra note' }),
  }),
  returns: s.any('Recorded feedback decision'),
  async run({ args, context }) {
    const record = await opsRepo.recordFeedbackDecision(scope(context), {
      sessionId: args.sessionId ?? null,
      runId: args.runId ?? null,
      targetType: args.targetType ?? null,
      targetId: args.targetId ?? null,
      tool: args.tool ?? null,
      decision: args.decision,
      accepted: args.accepted,
      rationale: args.rationale ?? args.note ?? null,
      metadata: {
        note: args.note ?? null,
        source: 'plan-engine',
        planId: context.planId,
      },
    });

    await auditRepo.log({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId ?? '',
      actorId: context.userId ?? 'system',
      action: 'SUPER_AGENT_FEEDBACK_RECORDED',
      entityType: args.targetType || 'super_agent',
      entityId: args.targetId || args.runId || args.sessionId || 'feedback',
      newValue: {
        decision: args.decision,
        accepted: args.accepted,
        tool: args.tool ?? null,
        rationale: args.rationale ?? args.note ?? null,
      },
      metadata: {
        source: 'plan-engine',
        runId: args.runId ?? null,
        sessionId: args.sessionId ?? null,
        planId: context.planId,
      },
    });

    return {
      ok: true,
      value: {
        id: record.id,
        decision: record.decision,
        accepted: record.accepted,
        rationale: record.rationale,
        createdAt: record.created_at,
      },
    };
  },
};

export const feedbackListTool: ToolSpec<FeedbackListArgs, unknown> = {
  name: 'feedback.list',
  version: '1.0.0',
  description: 'List the latest Super Agent feedback decisions for the workspace.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    limit: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Maximum number of decisions to return' }),
  }),
  returns: s.any('List of feedback decisions'),
  async run({ args, context }) {
    const rows = await opsRepo.listFeedbackDecisions(scope(context), args.limit ?? 25);
    return { ok: true, value: rows };
  },
};
