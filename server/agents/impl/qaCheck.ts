/**
 * server/agents/impl/qaCheck.ts
 *
 * QA / Policy Check Agent — validates resolution against company policies.
 *
 * Uses Gemini to analyze the planned resolution (execution_plan) against
 * retrieved knowledge articles and flags policy violations.
 *
 * Also serves as the Approval Gatekeeper: decides whether the execution
 * plan requires human approval based on amount, risk, and policy.
 *
 * Prompt returns JSON:
 * {
 *   policyCompliant: boolean,
 *   violations: [{policy, description, severity}],
 *   requiresApproval: boolean,
 *   approvalReason?: string,
 *   confidence: number,
 *   recommendation: string,
 * }
 */

import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const qaCheckImpl: AgentImplementation = {
  slug: 'qa-policy-check',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    // ── Fetch execution plan ──────────────────────────────────────────────
    const plan = db.prepare(`
      SELECT * FROM execution_plans
      WHERE case_id = ? AND status IN ('draft', 'approved', 'pending_approval')
      ORDER BY created_at DESC LIMIT 1
    `).get(caseId) as any;

    const policyText = knowledgeBundle.promptContext || 'No accessible policies found for this agent. Apply standard best practices and escalate uncertainty.';

    // ── Build prompt ──────────────────────────────────────────────────────
    const contextStr = contextWindow.toPromptString();
    const planStr = plan
      ? `Proposed execution plan: ${JSON.stringify(JSON.parse(plan.plan_steps ?? '[]'), null, 2)}`
      : 'No execution plan yet — assess the case context for policy compliance.';

    const prompt = `You are a QA and compliance specialist reviewing a CRM support case resolution.

CASE CONTEXT:
${contextStr}

${planStr}

COMPANY POLICIES:
${policyText}

Review the case and planned resolution for policy compliance. Return JSON:
{
  "policyCompliant": true | false,
  "violations": [
    {
      "policy": "Policy name",
      "description": "What was violated",
      "severity": "critical" | "high" | "medium" | "low"
    }
  ],
  "requiresApproval": true | false,
  "approvalReason": "Reason if requiresApproval is true",
  "confidence": 0.0 to 1.0,
  "recommendation": "Brief recommended action"
}

Approval is required if:
- Refund amount > $50
- Active chargeback or fraud signal
- Customer is high-risk
- Any critical policy violation
- Proposed action is irreversible (e.g. data deletion)`;

    // ── Call Gemini ───────────────────────────────────────────────────────
    let qaOutput: any;
    let tokensUsed = 0;

    try {
      const model = gemini.getGenerativeModel({
        model: reasoning.model,
        generationConfig: {
          temperature: reasoning.temperature,
          maxOutputTokens: reasoning.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });

      const response = await withGeminiRetry(
        () => model.generateContent(prompt),
        { label: 'qa-policy-check' },
      );
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      qaOutput = JSON.parse(text);
    } catch (err: any) {
      logger.error('QA check Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const {
      policyCompliant, violations = [], requiresApproval,
      approvalReason, confidence, recommendation,
    } = qaOutput;

    // ── Write violations to audit log ─────────────────────────────────────
    if (violations.length > 0) {
      const now = new Date().toISOString();
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, 'policy_violation_detected', ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          `${violations.length} policy violation(s) detected`,
          JSON.stringify({ violations, requiresApproval, citations: knowledgeBundle.citations, agentSlug: 'qa-policy-check' }),
          now,
        );
      } catch { /* non-critical */ }
    }

    // ── Update execution plan approval requirement ────────────────────────
    if (plan && requiresApproval && plan.status === 'draft') {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE execution_plans SET status = 'pending_approval', updated_at = ? WHERE id = ?
      `).run(now, plan.id);

      // Create approval request if one doesn't exist
      const existingApproval = db.prepare(
        "SELECT id FROM approval_requests WHERE case_id = ? AND status = 'pending'"
      ).get(caseId);

      if (!existingApproval) {
        db.prepare(`
          INSERT INTO approval_requests
            (id, case_id, tenant_id, workspace_id, requested_by, requested_by_type,
             action_type, action_payload, risk_level, status, evidence_package, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'qa-policy-check', 'agent', 'resolution_approval', ?, ?, 'pending', ?, ?, ?)
        `).run(
          randomUUID(),
          caseId, tenantId, ctx.workspaceId,
          JSON.stringify({ planId: plan.id, approvalReason }),
          contextWindow.case.riskLevel,
          JSON.stringify({ violations, qaRecommendation: recommendation, confidence }),
          new Date().toISOString(), new Date().toISOString(),
        );
      }
    }

    const costCredits = Math.ceil(tokensUsed / 1000);

    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `QA check: ${policyCompliant ? 'compliant' : 'violations found'}. ${recommendation}`,
      output: { policyCompliant, violations, requiresApproval, recommendation, citations: knowledgeBundle.citations },
    };
  },
};
