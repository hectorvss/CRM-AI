/**
 * server/agents/impl/reportGenerator.ts
 *
 * Report Generator Agent — generates AI diagnosis, root cause, and resolution summary.
 */

import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const reportGeneratorImpl: AgentImplementation = {
  slug: 'report-generator',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, workspaceId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;

    const contextStr = contextWindow.toPromptString();
    const isResolution = triggerEvent === 'case_resolved';

    const prompt = `You are an expert CRM analyst. ${isResolution
      ? 'Generate a resolution summary for a completed support case.'
      : 'Generate an AI diagnosis for an active support case.'
    }

${contextStr}

${knowledgeBundle.promptContext ? `ACCESSIBLE KNOWLEDGE AND POLICIES:\n${knowledgeBundle.promptContext}\n` : ''}

Return a JSON object with exactly these fields:
{
  "diagnosis": "Detailed diagnosis of what is happening in this case (2-4 sentences)",
  "rootCause": "The identified root cause of the issue (1-2 sentences)",
  "recommendedAction": "The specific recommended next step for the support agent (1-2 sentences)",
  "confidence": 0.0 to 1.0,
  ${isResolution ? '"resolutionSummary": "How the case was resolved (2-3 sentences)",' : ''}
  ${contextWindow.conflicts.length > 0 ? '"conflictSummary": "Brief summary of the conflicts detected",' : ''}
  "keyInsights": ["insight1", "insight2", "insight3"]
}

Focus on:
- What is the customer's actual problem?
- What system state discrepancies exist?
- What is the most efficient path to resolution?
- Are there policy or financial risks?`;

    let reportOutput: any;
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

      const response = await withGeminiRetry(() => model.generateContent(prompt), { label: 'report-generator' });
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      reportOutput = JSON.parse(text);
    } catch (err: any) {
      logger.error('Report generator Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const {
      diagnosis, rootCause, recommendedAction, confidence,
      resolutionSummary, conflictSummary, keyInsights = [],
    } = reportOutput;

    if (!diagnosis || !rootCause) {
      return { success: false, error: 'Report output missing required fields', tokensUsed };
    }

    const now = new Date().toISOString();
    if (useSupabase) {
      const { error } = await supabase!.from('cases').update({
        ai_diagnosis: diagnosis,
        ai_root_cause: rootCause,
        ai_recommended_action: recommendedAction,
        ai_confidence: confidence,
        updated_at: now,
      }).eq('id', caseId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
      if (error) throw error;
    } else {
      db!.prepare(`
        UPDATE cases SET
          ai_diagnosis = ?,
          ai_root_cause = ?,
          ai_recommended_action = ?,
          ai_confidence = ?,
          updated_at = ?
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(
        diagnosis, rootCause, recommendedAction, confidence, now,
        caseId, tenantId, workspaceId,
      );
    }

    const costCredits = Math.ceil(tokensUsed / 1000);
    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `Report generated: ${diagnosis.slice(0, 100)}...`,
      output: {
        diagnosis,
        rootCause,
        recommendedAction,
        resolutionSummary: resolutionSummary ?? null,
        conflictSummary: conflictSummary ?? null,
        keyInsights,
        citations: knowledgeBundle.citations,
      },
    };
  },
};
