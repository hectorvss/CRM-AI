/**
 * server/agents/planEngine/tools/agentDelegates.ts
 *
 * PlanEngine ToolSpecs that delegate to implemented catalog agents via the
 * job queue. These tools bridge the LLM-driven Plan Engine with the existing
 * agent pipeline — so the Super Agent can invoke specialist agents without
 * having to re-implement their logic.
 *
 * Pattern:
 *  1. Plan Engine calls agent.draft_reply({ caseId })
 *  2. Tool enqueues JobType.AGENT_EXECUTE for 'draft-reply-agent'
 *  3. Returns { jobId, status: 'enqueued', agentSlug }
 *
 * The caller (SuperAgent.tsx) can poll or subscribe via SSE for the result.
 */

import { s } from '../schema.js';
import type { ToolSpec } from '../types.js';
import { enqueue } from '../../../queue/client.js';
import { JobType } from '../../../queue/types.js';

// ── agent.draft_reply ────────────────────────────────────────────────────────

interface DraftReplyArgs {
  caseId: string;
  tone?: string;
}

interface DraftReplyResult {
  jobId: string;
  agentSlug: string;
  status: string;
}

export const agentDraftReplyTool: ToolSpec<DraftReplyArgs, DraftReplyResult> = {
  name: 'agent.draft_reply',
  version: '1.0.0',
  description:
    'Ask the Draft Reply Agent to compose a customer-facing reply for a support case. ' +
    'Returns a jobId — the draft will appear in the case thread once the agent completes.',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  timeoutMs: 8_000,

  args: s.object({
    caseId: s.string({ description: 'ID of the case to draft a reply for', required: true }),
    tone: s.string({ description: 'Tone of reply: professional | friendly | empathetic (default: professional)', required: false }),
  }),

  returns: s.object({
    jobId: s.string({ description: 'Job ID for the enqueued draft task', required: true }),
    agentSlug: s.string({ description: 'Agent slug that will handle the task', required: true }),
    status: s.string({ description: 'Always "enqueued"', required: true }),
  }),

  async run({ args, context }) {
    try {
      const jobId = await enqueue(
        JobType.AGENT_EXECUTE,
        {
          agentId: 'draft-reply-agent',
          agentSlug: 'draft-reply-agent',
          input: { caseId: args.caseId, tone: args.tone ?? 'professional' },
          context: {},
          isTest: false,
        },
        {
          tenantId: context.tenantId,
          workspaceId: context.workspaceId ?? undefined,
          traceId: `super-agent-draft-${args.caseId}-${Date.now()}`,
          priority: 7,
        },
      );
      return { ok: true, value: { jobId, agentSlug: 'draft-reply-agent', status: 'enqueued' as const } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), errorCode: 'ENQUEUE_FAILED' };
    }
  },
};

// ── agent.triage ─────────────────────────────────────────────────────────────

interface TriageArgs {
  caseId: string;
}

interface TriageResult {
  jobId: string;
  agentSlug: string;
  status: string;
}

export const agentTriageTool: ToolSpec<TriageArgs, TriageResult> = {
  name: 'agent.triage',
  version: '1.0.0',
  description:
    'Run the Triage Agent on a case: classifies intent, sets priority, and routes to the right queue. ' +
    'Returns a jobId — updates will be applied to the case automatically.',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  timeoutMs: 8_000,

  args: s.object({
    caseId: s.string({ description: 'ID of the case to triage', required: true }),
  }),

  returns: s.object({
    jobId: s.string({ description: 'Job ID for the triage task', required: true }),
    agentSlug: s.string({ description: 'Agent slug that will handle the task', required: true }),
    status: s.string({ description: 'Always "enqueued"', required: true }),
  }),

  async run({ args, context }) {
    try {
      const jobId = await enqueue(
        JobType.AGENT_EXECUTE,
        {
          agentId: 'triage-agent',
          agentSlug: 'triage-agent',
          input: { caseId: args.caseId },
          context: {},
          isTest: false,
        },
        {
          tenantId: context.tenantId,
          workspaceId: context.workspaceId ?? undefined,
          traceId: `super-agent-triage-${args.caseId}-${Date.now()}`,
          priority: 8,
        },
      );
      return { ok: true, value: { jobId, agentSlug: 'triage-agent', status: 'enqueued' as const } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), errorCode: 'ENQUEUE_FAILED' };
    }
  },
};

// ── agent.fraud_check ────────────────────────────────────────────────────────

interface FraudCheckArgs {
  caseId: string;
}

interface FraudCheckResult {
  jobId: string;
  agentSlug: string;
  status: string;
}

export const agentFraudCheckTool: ToolSpec<FraudCheckArgs, FraudCheckResult> = {
  name: 'agent.fraud_check',
  version: '1.0.0',
  description:
    'Run the Fraud Detector Agent on a case: analyses transaction patterns, velocity, and behavioural signals. ' +
    'Returns a jobId — the fraud assessment will be attached to the case.',
  category: 'case',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  timeoutMs: 10_000,

  args: s.object({
    caseId: s.string({ description: 'ID of the case to run fraud analysis on', required: true }),
  }),

  returns: s.object({
    jobId: s.string({ description: 'Job ID for the fraud check', required: true }),
    agentSlug: s.string({ description: 'Agent slug that will handle the task', required: true }),
    status: s.string({ description: 'Always "enqueued"', required: true }),
  }),

  async run({ args, context }) {
    try {
      const jobId = await enqueue(
        JobType.AGENT_EXECUTE,
        {
          agentId: 'fraud-detector',
          agentSlug: 'fraud-detector',
          input: { caseId: args.caseId },
          context: {},
          isTest: false,
        },
        {
          tenantId: context.tenantId,
          workspaceId: context.workspaceId ?? undefined,
          traceId: `super-agent-fraud-${args.caseId}-${Date.now()}`,
          priority: 9,
        },
      );
      return { ok: true, value: { jobId, agentSlug: 'fraud-detector', status: 'enqueued' as const } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), errorCode: 'ENQUEUE_FAILED' };
    }
  },
};

// ── agent.escalate ───────────────────────────────────────────────────────────

interface EscalateArgs {
  caseId: string;
  reason?: string;
}

interface EscalateResult {
  jobId: string;
  agentSlug: string;
  status: string;
}

export const agentEscalateTool: ToolSpec<EscalateArgs, EscalateResult> = {
  name: 'agent.escalate',
  version: '1.0.0',
  description:
    'Trigger the Escalation Manager to escalate a case: notifies the right team, updates SLA, creates an approval if needed.',
  category: 'case',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  timeoutMs: 8_000,

  args: s.object({
    caseId: s.string({ description: 'ID of the case to escalate', required: true }),
    reason: s.string({ description: 'Escalation reason (optional)', required: false }),
  }),

  returns: s.object({
    jobId: s.string({ description: 'Job ID for the escalation task', required: true }),
    agentSlug: s.string({ description: 'Agent slug that will handle the task', required: true }),
    status: s.string({ description: 'Always "enqueued"', required: true }),
  }),

  async run({ args, context }) {
    try {
      const jobId = await enqueue(
        JobType.AGENT_EXECUTE,
        {
          agentId: 'escalation-manager',
          agentSlug: 'escalation-manager',
          input: { caseId: args.caseId, reason: args.reason },
          context: {},
          isTest: false,
        },
        {
          tenantId: context.tenantId,
          workspaceId: context.workspaceId ?? undefined,
          traceId: `super-agent-escalate-${args.caseId}-${Date.now()}`,
          priority: 9,
        },
      );
      return { ok: true, value: { jobId, agentSlug: 'escalation-manager', status: 'enqueued' as const } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), errorCode: 'ENQUEUE_FAILED' };
    }
  },
};
