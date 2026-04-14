/**
 * server/agents/impl/qaCheck.ts
 *
 * QA / Policy Check Agent — validates resolution against company policies.
 */

import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const qaCheckImpl: AgentImplementation = {
  slug: 'qa-policy-check',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, workspaceId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;

    const plan = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('execution_plans')
            .select('*')
            .eq('case_id', caseId)
            .in('status', ['draft', 'approved', 'pending_approval'])
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data as any;
        })()
      : db!.prepare(`
          SELECT * FROM execution_plans
          WHERE case_id = ? AND status IN ('draft', 'approved', 'pending_approval')
          ORDER BY generated_at DESC LIMIT 1
        `).get(caseId) as any;

    const policyText = knowledgeBundle.promptContext || 'No accessible policies found for this agent. Apply standard best practices and escalate uncertainty.';
    const contextStr = contextWindow.toPromptString();
    const planStr = plan
      ? `Proposed execution plan: ${JSON.stringify(JSON.parse(plan.steps ?? '[]'), null, 2)}`
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

      const response = await withGeminiRetry(() => model.generateContent(prompt), { label: 'qa-policy-check' });
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

    if (violations.length > 0) {
      const now = new Date().toISOString();
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: 'policy_violation_detected',
            entity_type: 'case',
            entity_id: caseId,
            new_value: `${violations.length} policy violation(s) detected`,
            metadata: { violations, requiresApproval, citations: knowledgeBundle.citations, agentSlug: 'qa-policy-check' },
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', 'policy_violation_detected', 'case', ?, ?, ?, ?)
          `).run(
            randomUUID(), tenantId, workspaceId,
            caseId,
            `${violations.length} policy violation(s) detected`,
            JSON.stringify({ violations, requiresApproval, citations: knowledgeBundle.citations, agentSlug: 'qa-policy-check' }),
            now,
          );
        }
      } catch { /* non-critical */ }
    }

    if (plan && requiresApproval && plan.status === 'draft') {
      const now = new Date().toISOString();
      if (useSupabase) {
        const { error } = await supabase!.from('execution_plans')
          .update({ status: 'pending_approval' })
          .eq('id', plan.id)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId);
        if (error) throw error;
      } else {
        db!.prepare(`UPDATE execution_plans SET status = 'pending_approval' WHERE id = ?`).run(plan.id);
      }

      const existingApproval = useSupabase
        ? await (async () => {
            const { data, error } = await supabase!
              .from('approval_requests')
              .select('id')
              .eq('case_id', caseId)
              .eq('status', 'pending')
              .maybeSingle();
            if (error) throw error;
            return data as any;
          })()
        : db!.prepare("SELECT id FROM approval_requests WHERE case_id = ? AND status = 'pending'").get(caseId);

      if (!existingApproval) {
        if (useSupabase) {
          const { error } = await supabase!.from('approval_requests').insert({
            id: randomUUID(),
            case_id: caseId,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            requested_by: 'qa-policy-check',
            requested_by_type: 'agent',
            action_type: 'resolution_approval',
            action_payload: { planId: plan.id, approvalReason },
            risk_level: contextWindow.case.riskLevel,
            status: 'pending',
            evidence_package: { violations, qaRecommendation: recommendation, confidence },
            created_at: now,
            updated_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO approval_requests
              (id, case_id, tenant_id, workspace_id, requested_by, requested_by_type,
               action_type, action_payload, risk_level, status, evidence_package, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'qa-policy-check', 'agent', 'resolution_approval', ?, ?, 'pending', ?, ?, ?)
          `).run(
            randomUUID(),
            caseId, tenantId, workspaceId,
            JSON.stringify({ planId: plan.id, approvalReason }),
            contextWindow.case.riskLevel,
            JSON.stringify({ violations, qaRecommendation: recommendation, confidence }),
            now, now,
          );
        }
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
