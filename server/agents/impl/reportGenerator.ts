/**
 * server/agents/impl/reportGenerator.ts
 *
 * Report Generator Agent — generates AI diagnosis, root cause, and resolution summary.
 *
 * Uses Gemini with the full context window to produce structured diagnosis text.
 * Writes the output back to the case row fields:
 *   - ai_diagnosis
 *   - ai_root_cause
 *   - ai_recommended_action
 *   - ai_confidence
 *
 * Prompt returns JSON:
 * {
 *   diagnosis: string,
 *   rootCause: string,
 *   recommendedAction: string,
 *   confidence: number,
 *   conflictSummary?: string,
 *   resolutionSummary?: string,
 *   keyInsights: string[],
 * }
 */

import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const reportGeneratorImpl: AgentImplementation = {
  slug: 'report-generator',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    // ── Build prompt ──────────────────────────────────────────────────────
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

    // ── Call Gemini ───────────────────────────────────────────────────────
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

      const response = await withGeminiRetry(
        () => model.generateContent(prompt),
        { label: 'report-generator' },
      );
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

    // ── Write to case ─────────────────────────────────────────────────────
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE cases SET
        ai_diagnosis = ?,
        ai_root_cause = ?,
        ai_recommended_action = ?,
        ai_confidence = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      diagnosis, rootCause, recommendedAction, confidence, now,
      caseId, tenantId,
    );

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
