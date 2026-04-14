import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const fraudDetectorImpl: AgentImplementation = {
  slug: 'fraud-detector',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();

    const prompt = `You are an expert fraud analyst for an e-commerce CRM.
Analyze this support case for fraud indicators.

${contextWindow.toPromptString()}

${knowledgeBundle.promptContext ? `ACCESSIBLE KNOWLEDGE AND POLICIES:\n${knowledgeBundle.promptContext}\n` : ''}

Return a JSON object with exactly these fields:
{
  "fraudRisk": "none" | "low" | "medium" | "high" | "critical",
  "signals": ["list of specific fraud signals detected"],
  "confidence": 0.0 to 1.0,
  "recommendation": "What action should be taken (1-2 sentences)",
  "requiresBlock": true | false,
  "blockReason": "Only if requiresBlock is true"
}`;

    let fraudOutput: any;
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

      const response = await withGeminiRetry(() => model.generateContent(prompt), { label: 'fraud-detector' });
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      fraudOutput = JSON.parse(text);
    } catch (err: any) {
      logger.error('Fraud detector Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const { fraudRisk = 'none', signals = [], confidence = 0, recommendation, requiresBlock, blockReason } = fraudOutput;
    if (!fraudRisk) return { success: false, error: 'Fraud output missing fraudRisk field', tokensUsed };

    if (fraudRisk !== 'none') {
      try {
        const payload = {
          fraudRisk,
          signals,
          confidence,
          recommendation,
          requiresBlock,
          blockReason,
          citations: knowledgeBundle.citations,
          agentRunId: runId,
        };
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: `fraud_assessment:${fraudRisk}`,
            entity_type: 'case',
            entity_id: caseId,
            new_value: `Fraud risk ${fraudRisk}: ${signals.slice(0, 3).join('; ')}`,
            metadata: payload,
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
          `).run(randomUUID(), tenantId, workspaceId, `fraud_assessment:${fraudRisk}`, caseId, `Fraud risk ${fraudRisk}: ${signals.slice(0, 3).join('; ')}`, JSON.stringify(payload), now);
        }
      } catch (err: any) {
        logger.error('Failed to write fraud audit event', { caseId, error: err?.message });
      }
    }

    if (fraudRisk === 'high' || fraudRisk === 'critical') {
      try {
        if (useSupabase) {
          await supabase!.from('cases').update({ risk_level: fraudRisk === 'critical' ? 'critical' : 'high', updated_at: now }).eq('id', caseId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
        } else {
          db!.prepare('UPDATE cases SET risk_level = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?').run(fraudRisk === 'critical' ? 'critical' : 'high', now, caseId, tenantId, workspaceId);
        }
      } catch {
        // non-critical
      }

      if (requiresBlock) {
        try {
          const actionPayload = JSON.stringify({ reason: blockReason ?? 'Fraud detected', recommendation });
          const evidence = JSON.stringify({ fraudRisk, signals, confidence, agentRunId: runId });
          if (useSupabase) {
            const { error } = await supabase!.from('approval_requests').insert({
              id: randomUUID(),
              case_id: caseId,
              tenant_id: tenantId,
              workspace_id: workspaceId,
              requested_by: 'fraud-detector',
              requested_by_type: 'agent',
              action_type: 'block_customer',
              action_payload: actionPayload,
              risk_level: fraudRisk === 'critical' ? 'critical' : 'high',
              evidence_package: evidence,
              status: 'pending',
              created_at: now,
              updated_at: now,
            });
            if (error) throw error;
          } else {
            db!.prepare(`
              INSERT OR IGNORE INTO approval_requests
                (id, case_id, tenant_id, workspace_id, requested_by, requested_by_type,
                 action_type, action_payload, risk_level, evidence_package, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'fraud-detector', 'agent', 'block_customer', ?, ?, ?, 'pending', ?, ?)
            `).run(randomUUID(), caseId, tenantId, workspaceId, actionPayload, fraudRisk === 'critical' ? 'critical' : 'high', evidence, now, now);
          }
        } catch {
          // non-critical
        }
      }
    }

    const costCredits = Math.ceil(tokensUsed / 1000);
    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `Fraud assessment: ${fraudRisk} risk — ${signals.length} signal(s) detected`,
      output: { fraudRisk, signals, recommendation, requiresBlock, citations: knowledgeBundle.citations },
    };
  },
};
