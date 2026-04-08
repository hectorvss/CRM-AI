import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const qaCheckImpl: AgentImplementation = {
  slug: 'qa-policy-check',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, tenantId, knowledgeBundle } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    const plan = db.prepare(`
      SELECT * FROM execution_plans
      WHERE case_id = ? AND status IN ('draft', 'approved', 'pending_approval')
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(caseId) as any;

    const policyText = knowledgeBundle.promptContext || 'No specific policies found. Apply standard best practices.';
    const contextStr = contextWindow.toPromptString();
    const planStr = plan
      ? `Proposed execution plan: ${JSON.stringify(JSON.parse(plan.steps ?? '[]'), null, 2)}`
      : 'No execution plan yet - assess the case context for policy compliance.';

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
- Proposed action is irreversible`;

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

      const response = await model.generateContent(prompt);
      qaOutput = JSON.parse(response.response.text());
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
    } catch (err: any) {
      logger.error('QA check Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const {
      policyCompliant,
      violations = [],
      requiresApproval,
      approvalReason,
      confidence,
      recommendation,
    } = qaOutput;

    if (violations.length > 0) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata, occurred_at)
          VALUES (?, ?, ?, 'qa-policy-check', 'system', 'POLICY_VIOLATION_DETECTED', 'case', ?, ?, ?)
        `).run(
          randomUUID(),
          tenantId,
          ctx.workspaceId,
          caseId,
          JSON.stringify({ violations, requiresApproval, citations: knowledgeBundle.citations }),
          new Date().toISOString(),
        );
      } catch {
        // Non-critical audit write failure should not fail QA.
      }
    }

    if (plan && requiresApproval && plan.status === 'draft') {
      db.prepare(`
        UPDATE execution_plans
        SET status = 'pending_approval'
        WHERE id = ?
      `).run(plan.id);

      const existingApproval = db.prepare(`
        SELECT id
        FROM approval_requests
        WHERE case_id = ? AND status = 'pending'
        LIMIT 1
      `).get(caseId) as any;

      if (!existingApproval) {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO approval_requests
            (id, case_id, tenant_id, workspace_id, requested_by, requested_by_type,
             action_type, action_payload, risk_level, status, evidence_package, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'qa-policy-check', 'agent', 'resolution_approval', ?, ?, 'pending', ?, ?, ?)
        `).run(
          randomUUID(),
          caseId,
          tenantId,
          ctx.workspaceId,
          JSON.stringify({ planId: plan.id, approvalReason }),
          contextWindow.case.riskLevel,
          JSON.stringify({ violations, qaRecommendation: recommendation, confidence, citations: knowledgeBundle.citations }),
          now,
          now,
        );
      }
    }

    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits: Math.ceil(tokensUsed / 1000),
      summary: `QA check: ${policyCompliant ? 'compliant' : 'violations found'}. ${recommendation}`,
      output: {
        policyCompliant,
        violations,
        requiresApproval,
        recommendation,
        citations: knowledgeBundle.citations,
      },
    };
  },
};
