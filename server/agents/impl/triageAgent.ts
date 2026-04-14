/**
 * server/agents/impl/triageAgent.ts
 */

import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

const SLA_DEADLINES_HOURS: Record<string, { first_response: number; resolution: number }> = {
  tier1: { first_response: 1, resolution: 4 },
  tier2: { first_response: 4, resolution: 24 },
  tier3: { first_response: 8, resolution: 72 },
};

async function readCurrentTags(
  useSupabase: boolean,
  db: ReturnType<typeof getDb> | null,
  supabase: ReturnType<typeof getSupabaseAdmin> | null,
  caseId: string,
  tenantId: string,
  workspaceId: string,
): Promise<string[]> {
  if (useSupabase) {
    const { data, error } = await supabase!
      .from('cases')
      .select('tags')
      .eq('id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    return JSON.parse(data?.tags ?? '[]');
  }

  const currentCase = db!.prepare('SELECT tags FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(caseId, tenantId, workspaceId) as any;
  return JSON.parse(currentCase?.tags ?? '[]');
}

export const triageAgentImpl: AgentImplementation = {
  slug: 'triage-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, workspaceId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;

    const prompt = `You are a CRM triage specialist. Analyze this support case and classify it.

${contextWindow.toPromptString()}

${knowledgeBundle.promptContext ? `ACCESSIBLE KNOWLEDGE AND POLICIES:\n${knowledgeBundle.promptContext}\n` : ''}

Return a JSON object with exactly these fields:
{
  "urgency": "critical" | "high" | "medium" | "low",
  "severity": "S1" | "S2" | "S3" | "S4",
  "priority": "urgent" | "high" | "normal" | "low",
  "slaTier": "tier1" | "tier2" | "tier3",
  "reasoning": "Brief explanation of classification",
  "confidence": 0.0 to 1.0,
  "suggestedTags": ["tag1", "tag2"],
  "requiresImmediateEscalation": true | false,
  "escalationReason": "Only if requiresImmediateEscalation is true"
}`;

    let triageOutput: any;
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

      const response = await withGeminiRetry(() => model.generateContent(prompt), { label: 'triage-agent' });
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      triageOutput = JSON.parse(text);
    } catch (err: any) {
      logger.error('Triage agent Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const {
      urgency, severity, priority, slaTier, reasoning: triageReason,
      confidence, suggestedTags = [], requiresImmediateEscalation, escalationReason,
    } = triageOutput;

    if (!urgency || !severity || !priority || !slaTier) {
      return { success: false, error: 'Triage output missing required fields', tokensUsed };
    }

    const now = new Date().toISOString();
    const slaDeadlines = SLA_DEADLINES_HOURS[slaTier] ?? SLA_DEADLINES_HOURS.tier2;
    const firstResponseDeadline = new Date(Date.now() + slaDeadlines.first_response * 3600000).toISOString();
    const resolutionDeadline = new Date(Date.now() + slaDeadlines.resolution * 3600000).toISOString();
    const currentTags = await readCurrentTags(useSupabase, db, supabase, caseId, tenantId, workspaceId);
    const mergedTags = [...new Set([...currentTags, ...suggestedTags])];

    if (useSupabase) {
      const { error } = await supabase!.from('cases')
        .update({
          priority,
          severity,
          sla_first_response_deadline: firstResponseDeadline,
          sla_resolution_deadline: resolutionDeadline,
          tags: JSON.stringify(mergedTags),
          updated_at: now,
        })
        .eq('id', caseId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
      if (error) throw error;
    } else {
      db!.prepare(`
        UPDATE cases SET
          priority = ?, severity = ?,
          sla_first_response_deadline = ?, sla_resolution_deadline = ?,
          tags = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(priority, severity, firstResponseDeadline, resolutionDeadline, JSON.stringify(mergedTags), now, caseId, tenantId, workspaceId);
    }

    if (requiresImmediateEscalation) {
      try {
        const auditPayload = {
          urgency,
          severity,
          agentSlug: 'triage-agent',
          escalationReason: escalationReason ?? 'Immediate escalation required by triage agent',
        };

        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: 'escalation_required',
            entity_type: 'case',
            entity_id: caseId,
            new_value: auditPayload.escalationReason,
            metadata: auditPayload,
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', 'escalation_required', 'case', ?, ?, ?, ?)
          `).run(randomUUID(), tenantId, workspaceId, caseId, auditPayload.escalationReason, JSON.stringify(auditPayload), now);
        }
      } catch {
        // non-critical
      }
    }

    const costCredits = Math.ceil(tokensUsed / 1000);
    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `Triaged as ${priority}/${severity} (${slaTier}). ${triageReason}`,
      output: { urgency, severity, priority, slaTier, requiresImmediateEscalation, suggestedTags },
    };
  },
};
