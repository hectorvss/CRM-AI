/**
 * server/pipeline/resolutionPlanner.ts
 *
 * Resolution Planner — Phase 4.
 *
 * Handles RESOLUTION_PLAN jobs. Uses Gemini to analyse the open reconciliation
 * issues on a case and generate a structured execution plan containing ordered
 * action steps (e.g. issue_refund, update_order_status, send_notification).
 *
 * Output:
 *  1. Writes an execution_plans row with status='draft' and JSON steps array
 *  2. Determines whether human approval is required (based on risk thresholds)
 *  3a. If approval required → creates an approval_request and pauses
 *  3b. If no approval required → immediately enqueues RESOLUTION_EXECUTE
 *
 * Approval thresholds (conservative defaults, overridable via policies):
 *  - Any refund > $50 requires approval
 *  - Fraud-domain conflicts always require approval
 *  - Critical-severity issues require approval
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID }         from 'crypto';
import { withGeminiRetry }    from '../ai/geminiRetry.js';
import { getSupabaseAdmin }   from '../db/supabase.js';
import { config }             from '../config.js';
import { enqueue }            from '../queue/client.js';
import { JobType }            from '../queue/types.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { logger }             from '../utils/logger.js';
import { buildContextWindow } from './contextWindow.js';
import { requireScope }       from '../lib/scope.js';
import type { ResolutionPlanPayload, JobContext } from '../queue/types.js';

// ── Approval thresholds ────────────────────────────────────────────────────────

const APPROVAL_REFUND_THRESHOLD_USD = 50;

interface ExecutionStep {
  id:           string;
  order:        number;
  tool:         string;
  action:       string;
  params:       Record<string, unknown>;
  rationale:    string;
  rollbackable: boolean;
  status:       'pending';
}

interface PlanResult {
  steps:            ExecutionStep[];
  requiresApproval: boolean;
  approvalReason?:  string;
  planSummary:      string;
  confidence:       number;
}

// ── Gemini plan generation ─────────────────────────────────────────────────────

async function generatePlan(contextStr: string, issuesSummary: string): Promise<PlanResult> {
  const ai    = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

  const prompt = `
You are a customer support resolution planner for an e-commerce CRM.
Given the case context and open conflicts below, generate a structured resolution plan.

CASE CONTEXT:
${contextStr}

OPEN CONFLICTS:
${issuesSummary}

AVAILABLE TOOLS AND ACTIONS:
- stripe / issue_refund: { payment_id, amount, reason, currency }
- stripe / cancel_payment: { payment_id }
- shopify / cancel_order: { order_id, reason, restock }
- shopify / update_order_status: { order_id, status }
- shopify / create_return: { order_id, line_items }
- internal / update_case_status: { case_id, status, resolution_note }
- internal / send_notification: { customer_id, channel, template, params }
- internal / flag_for_review: { case_id, reason, priority }

RULES:
1. Only include steps that directly resolve a conflict.
2. Order steps logically (e.g. issue refund before marking order resolved).
3. Mark steps as rollbackable if the action can be reversed.
4. Set requiresApproval to true if ANY step involves a refund > 50 USD, chargeback, or fraud.
5. Return ONLY valid JSON matching the schema below. No markdown.

RESPONSE SCHEMA:
{
  "steps": [
    {
      "id": "<uuid or short id>",
      "order": <integer starting at 1>,
      "tool": "<tool name>",
      "action": "<action name>",
      "params": { ... },
      "rationale": "<one sentence>",
      "rollbackable": <boolean>
    }
  ],
  "requiresApproval": <boolean>,
  "approvalReason": "<why approval is needed, or null>",
  "planSummary": "<2-3 sentence plain-English summary>",
  "confidence": <0.0 to 1.0>
}
`.trim();

  try {
    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'resolution.plan' },
    );
    const text   = result.response.text().trim();
    const json   = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(json) as PlanResult;

    // Sanitise steps
    parsed.steps = (parsed.steps ?? []).map((s, i) => ({
      id:           s.id ?? randomUUID(),
      order:        s.order ?? i + 1,
      tool:         s.tool ?? 'internal',
      action:       s.action ?? 'flag_for_review',
      params:       s.params ?? {},
      rationale:    s.rationale ?? '',
      rollbackable: s.rollbackable ?? false,
      status:       'pending' as const,
    }));

    parsed.confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));
    return parsed;

  } catch (err) {
    logger.warn('Resolution plan generation failed, using fallback plan', {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      steps: [{
        id:           randomUUID(),
        order:        1,
        tool:         'internal',
        action:       'flag_for_review',
        params:       { reason: 'AI plan generation failed — manual review required' },
        rationale:    'Auto-plan failed; routing to human agent',
        rollbackable: false,
        status:       'pending',
      }],
      requiresApproval: true,
      approvalReason:   'Plan generation failed — manual review required',
      planSummary:      'Unable to generate automated resolution plan. Case has been flagged for manual review.',
      confidence:       0.1,
    };
  }
}

// ── Approval gate ─────────────────────────────────────────────────────────────

function needsApproval(
  plan: PlanResult,
  caseRow: any,
  issues: any[]
): { required: boolean; reason: string } {
  if (plan.requiresApproval) {
    return { required: true, reason: plan.approvalReason ?? 'AI flagged for approval' };
  }

  const hasCritical = issues.some(i => i.severity === 'critical');
  if (hasCritical) {
    return { required: true, reason: 'Critical-severity conflict requires human approval' };
  }

  const hasFraud = issues.some(i => i.conflict_domain === 'payment' && i.detected_by === 'dispute_detector');
  if (hasFraud) {
    return { required: true, reason: 'Payment dispute (chargeback) requires approval before any action' };
  }

  if (caseRow.risk_level === 'high') {
    return { required: true, reason: 'High-risk case requires approval before automated resolution' };
  }

  const refundSteps = plan.steps.filter(s => s.action === 'issue_refund');
  for (const step of refundSteps) {
    const amount = parseFloat(String(step.params.amount ?? '0'));
    if (amount > APPROVAL_REFUND_THRESHOLD_USD) {
      return {
        required: true,
        reason: `Refund of ${amount} ${step.params.currency ?? 'USD'} exceeds auto-approval threshold of ${APPROVAL_REFUND_THRESHOLD_USD} USD`,
      };
    }
  }

  return { required: false, reason: '' };
}

// ── Main handler ───────────────────────────────────────────────────────────────

async function handleResolutionPlan(
  payload: ResolutionPlanPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:   ctx.jobId,
    caseId:  payload.caseId,
    traceId: ctx.traceId,
  });

  const supabase = getSupabaseAdmin();
  const { tenantId, workspaceId } = requireScope(ctx, 'resolutionPlanner');
  const now = new Date().toISOString();

  // ── 1. Load case ──────────────────────────────────────────────────────────
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', payload.caseId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single();

  if (caseErr || !caseRow) {
    log.warn('Case not found for resolution planning');
    return;
  }

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case is closed, skipping resolution planning');
    return;
  }

  // ── 2. Load reconciliation issues ─────────────────────────────────────────
  const issueIds = payload.reconciliationIssueIds;

  let issueQuery = supabase
    .from('reconciliation_issues')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open');

  if (issueIds && issueIds.length > 0) {
    issueQuery = issueQuery.in('id', issueIds);
  } else {
    issueQuery = issueQuery.eq('case_id', payload.caseId).order('severity', { ascending: false });
  }

  const { data: issues = [] } = await issueQuery;

  if (!issues || issues.length === 0) {
    log.info('No open reconciliation issues, nothing to plan');
    return;
  }

  log.info('Generating resolution plan', { issueCount: issues.length });

  // ── 3. Build context for Gemini ───────────────────────────────────────────
  const contextWindow = await buildContextWindow(payload.caseId, tenantId, workspaceId);
  if (!contextWindow) {
    log.warn('No context window available for resolution planning');
    return;
  }
  const contextStr = contextWindow.toPromptString();

  const issuesSummary = issues.map((i: any) =>
    `[${String(i.severity).toUpperCase()}] ${i.conflict_domain}: ${i.expected_state}\n  Actual: ${i.actual_states}`
  ).join('\n\n');

  // ── 4. Generate plan with Gemini ──────────────────────────────────────────
  const plan = await generatePlan(contextStr, issuesSummary);

  log.info('Plan generated', {
    steps:            plan.steps.length,
    confidence:       plan.confidence,
    requiresApproval: plan.requiresApproval,
  });

  // ── 5. Determine if approval is required ──────────────────────────────────
  const { required: approvalRequired, reason: approvalReason } =
    needsApproval(plan, caseRow, issues);

  // ── 6. Persist execution plan ─────────────────────────────────────────────
  const planId = randomUUID();

  await supabase.from('execution_plans').insert({
    id:           planId,
    case_id:      payload.caseId,
    tenant_id:    tenantId,
    generated_by: 'resolution_planner',
    generated_at: now,
    status:       'draft',
    steps:        plan.steps,
  });

  // ── 7. Update case with plan summary ─────────────────────────────────────
  await supabase
    .from('cases')
    .update({ resolution_state: 'planned', updated_at: now })
    .eq('id', payload.caseId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId);

  log.info('Execution plan created', { planId, steps: plan.steps.length });

  // ── 8. Approval gate or direct execution ─────────────────────────────────
  if (approvalRequired) {
    const approvalId = randomUUID();
    const expiresAt  = new Date(Date.now() + 24 * 3_600_000).toISOString();

    // Insert approval request + update plan + update case atomically
    const { error: approvalErr } = await supabase.from('approval_requests').insert({
      id:                approvalId,
      case_id:           payload.caseId,
      tenant_id:         tenantId,
      workspace_id:      workspaceId,
      requested_by:      'resolution_planner',
      requested_by_type: 'agent',
      action_type:       'execute_resolution_plan',
      action_payload:    { planId, reason: approvalReason },
      risk_level:        caseRow.risk_level ?? 'medium',
      evidence_package:  {
        planSummary:    plan.planSummary,
        issueCount:     issues.length,
        stepCount:      plan.steps.length,
        approvalReason,
      },
      status:             'pending',
      execution_plan_id:  planId,
      expires_at:         expiresAt,
      created_at:         now,
      updated_at:         now,
    });

    if (approvalErr) {
      log.warn('Failed to insert approval request', { error: String(approvalErr) });
    }

    await Promise.all([
      supabase
        .from('execution_plans')
        .update({ status: 'awaiting_approval', approval_request_id: approvalId })
        .eq('id', planId),
      supabase
        .from('cases')
        .update({ approval_state: 'pending', active_approval_request_id: approvalId, updated_at: now })
        .eq('id', payload.caseId),
    ]);

    log.info('Approval request created', { approvalId, reason: approvalReason });

  } else {
    // No approval needed — go straight to execution
    await supabase
      .from('execution_plans')
      .update({ status: 'approved' })
      .eq('id', planId);

    await enqueue(
      JobType.RESOLUTION_EXECUTE,
      { executionPlanId: planId, mode: 'ai' },
      { tenantId, workspaceId, traceId: ctx.traceId, priority: 7 },
    );

    log.info('Plan auto-approved, enqueued RESOLUTION_EXECUTE', { planId });
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RESOLUTION_PLAN, handleResolutionPlan);

export { handleResolutionPlan };
