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
 *
 * Step shape (stored as JSON in execution_plans.steps):
 * {
 *   id: string,
 *   order: number,
 *   tool: 'stripe' | 'shopify' | 'internal',
 *   action: 'issue_refund' | 'cancel_order' | 'update_status' | 'send_notification' | ...,
 *   params: Record<string, unknown>,
 *   rationale: string,
 *   rollbackable: boolean,
 *   status: 'pending' | 'running' | 'done' | 'failed' | 'skipped',
 * }
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID }         from 'crypto';
import { withGeminiRetry }    from '../ai/geminiRetry.js';
import { getDb }              from '../db/client.js';
import { config }             from '../config.js';
import { enqueue }            from '../queue/client.js';
import { JobType }            from '../queue/types.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { logger }             from '../utils/logger.js';
import { buildContextWindow } from './contextWindow.js';
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
  steps:           ExecutionStep[];
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

    // Fallback: flag case for manual review
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
  // AI explicitly requested approval
  if (plan.requiresApproval) {
    return { required: true, reason: plan.approvalReason ?? 'AI flagged for approval' };
  }

  // Critical severity issues always require approval
  const hasCritical = issues.some(i => i.severity === 'critical');
  if (hasCritical) {
    return { required: true, reason: 'Critical-severity conflict requires human approval' };
  }

  // Fraud domain always requires approval
  const hasFraud = issues.some(i => i.conflict_domain === 'payment' && i.detected_by === 'dispute_detector');
  if (hasFraud) {
    return { required: true, reason: 'Payment dispute (chargeback) requires approval before any action' };
  }

  // High-risk case
  if (caseRow.risk_level === 'high') {
    return { required: true, reason: 'High-risk case requires approval before automated resolution' };
  }

  // Refund amount threshold
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

  const db          = getDb();
  const tenantId    = ctx.tenantId    ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';

  // ── 1. Load case ──────────────────────────────────────────────────────────
  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(payload.caseId) as any;
  if (!caseRow) {
    log.warn('Case not found for resolution planning');
    return;
  }

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case is closed, skipping resolution planning');
    return;
  }

  // ── 2. Load reconciliation issues ─────────────────────────────────────────
  const issueIds = payload.reconciliationIssueIds;
  const issues = issueIds.length > 0
    ? db.prepare(`
        SELECT * FROM reconciliation_issues
        WHERE id IN (${issueIds.map(() => '?').join(',')}) AND status = 'open'
      `).all(...issueIds) as any[]
    : db.prepare(`
        SELECT * FROM reconciliation_issues
        WHERE case_id = ? AND status = 'open'
        ORDER BY severity DESC
      `).all(payload.caseId) as any[];

  if (issues.length === 0) {
    log.info('No open reconciliation issues, nothing to plan');
    return;
  }

  log.info('Generating resolution plan', { issueCount: issues.length });

  // ── 3. Build context for Gemini ───────────────────────────────────────────
  const contextWindow = await buildContextWindow(payload.caseId, tenantId);
  if (!contextWindow) {
    log.warn('No context window available for resolution planning');
    return;
  }
  const contextStr    = contextWindow.toPromptString();

  const issuesSummary = issues.map(i =>
    `[${i.severity.toUpperCase()}] ${i.conflict_domain}: ${i.expected_state}\n  Actual: ${i.actual_states}`
  ).join('\n\n');

  // ── 4. Generate plan with Gemini ──────────────────────────────────────────
  const plan = await generatePlan(contextStr, issuesSummary);

  log.info('Plan generated', {
    steps:      plan.steps.length,
    confidence: plan.confidence,
    requiresApproval: plan.requiresApproval,
  });

  // ── 5. Determine if approval is required ──────────────────────────────────
  const { required: approvalRequired, reason: approvalReason } =
    needsApproval(plan, caseRow, issues);

  // ── 6. Persist execution plan ─────────────────────────────────────────────
  const planId = randomUUID();
  const now    = new Date().toISOString();

  db.prepare(`
    INSERT INTO execution_plans (
      id, case_id, tenant_id, generated_by,
      generated_at, status, steps
    ) VALUES (?, ?, ?, 'resolution_planner', ?, 'draft', ?)
  `).run(
    planId,
    payload.caseId,
    tenantId,
    now,
    JSON.stringify(plan.steps),
  );

  // ── 7. Update case with plan summary ─────────────────────────────────────
  db.prepare(`
    UPDATE cases SET
      resolution_state = 'planned',
      updated_at       = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.caseId);

  log.info('Execution plan created', { planId, steps: plan.steps.length });

  // ── 8. Approval gate or direct execution ─────────────────────────────────
  if (approvalRequired) {
    const approvalId = randomUUID();

    // Wrap in transaction so approval_request, plan status, and case state
    // are either ALL committed or ALL rolled back.
    const createApproval = db.transaction(() => {
      db.prepare(`
        INSERT INTO approval_requests (
          id, case_id, tenant_id, workspace_id,
          requested_by, requested_by_type,
          action_type, action_payload,
          risk_level, evidence_package,
          status, execution_plan_id,
          expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'resolution_planner', 'agent', 'execute_resolution_plan', ?, ?, ?, 'pending', ?, ?, ?, ?)
      `).run(
        approvalId,
        payload.caseId,
        tenantId,
        workspaceId,
        JSON.stringify({ planId, reason: approvalReason }),
        caseRow.risk_level ?? 'medium',
        JSON.stringify({
          planSummary:  plan.planSummary,
          issueCount:   issues.length,
          stepCount:    plan.steps.length,
          approvalReason,
        }),
        planId,
        new Date(Date.now() + 24 * 3_600_000).toISOString(),
        now,
        now,
      );

      // Update plan to awaiting_approval
      db.prepare(`
        UPDATE execution_plans SET
          status              = 'awaiting_approval',
          approval_request_id = ?
        WHERE id = ?
      `).run(approvalId, planId);

      db.prepare(`
        UPDATE cases SET
          approval_state            = 'pending',
          active_approval_request_id = ?,
          updated_at                = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approvalId, payload.caseId);
    });

    createApproval();

    log.info('Approval request created', {
      approvalId,
      reason: approvalReason,
    });

  } else {
    // No approval needed — go straight to execution
    db.prepare(`
      UPDATE execution_plans SET status = 'approved' WHERE id = ?
    `).run(planId);

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
