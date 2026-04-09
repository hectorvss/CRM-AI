/**
 * server/agents/impl/composerTranslator.ts
 *
 * Composer + Translator Agent — drafts and localizes internal and
 * customer-facing messages.
 *
 * Uses Gemini to generate messages with the appropriate tone, language,
 * and policy constraints based on context. Can produce:
 *   - Customer-facing replies
 *   - Internal notes for agents
 *   - Escalation summaries
 *
 * Unlike draft-reply-agent (which delegates to the pipeline), this agent
 * handles the full composition lifecycle including localization hints.
 *
 * Prompt returns JSON:
 * {
 *   draft: string,
 *   tone: string,
 *   language: string,
 *   internalNote?: string,
 *   confidence: number,
 *   policyConstraints: string[],
 * }
 */

import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const composerTranslatorImpl: AgentImplementation = {
  slug: 'composer-translator',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    // ── Determine composition objective ──────────────────────────────────
    const isResolution = triggerEvent === 'case_resolved';
    const hasConflicts = contextWindow.conflicts.length > 0;
    const customerName = contextWindow.customer?.name ?? 'Customer';

    // Detect language from latest message (simple heuristic)
    const lastMessage = contextWindow.messages[contextWindow.messages.length - 1];
    const messageText = lastMessage?.content ?? '';

    // ── Build prompt ─────────────────────────────────────────────────────
    const contextStr = contextWindow.toPromptString();

    const prompt = `You are an expert CRM communication composer.
Draft a ${isResolution ? 'resolution confirmation' : hasConflicts ? 'conflict update' : 'professional reply'} for this case.

${contextStr}

${knowledgeBundle.promptContext ? `ACCESSIBLE KNOWLEDGE AND POLICIES:\n${knowledgeBundle.promptContext}\n` : ''}

Customer name: ${customerName}
Latest message: "${messageText.slice(0, 500)}"

Return a JSON object with exactly these fields:
{
  "draft": "The full customer-facing message text",
  "tone": "professional" | "empathetic" | "friendly" | "formal",
  "language": "en" | "es" | "fr" | "de" (detected from customer messages),
  "internalNote": "Brief internal note for the support team (optional)",
  "confidence": 0.0 to 1.0,
  "policyConstraints": ["any policy rules applied to this draft"]
}

Rules:
- Be empathetic for VIP or high-risk customers
- Never promise specific refund amounts unless approved
- Never disclose internal system details
- Keep messages concise but complete
- If conflicts exist, acknowledge the issue without over-explaining
- If resolving, summarize what was done and next steps`;

    // ── Call Gemini ───────────────────────────────────────────────────────
    let output: any;
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
        { label: 'composer-translator' },
      );
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      output = JSON.parse(text);
    } catch (err: any) {
      logger.error('Composer agent Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const { draft, tone, language, internalNote, confidence, policyConstraints = [] } = output;

    if (!draft) {
      return { success: false, error: 'Composer output missing draft field', tokensUsed };
    }

    const now = new Date().toISOString();

    // ── Store draft reply ────────────────────────────────────────────────
    try {
      db.prepare(`
        INSERT INTO draft_replies
          (id, case_id, tenant_id, content, tone, status, generated_by, generated_at)
        VALUES (?, ?, ?, ?, ?, 'pending_review', 'composer-translator', ?)
      `).run(randomUUID(), caseId, tenantId, draft, tone ?? 'professional', now);
    } catch (err: any) {
      logger.error('Failed to store composed draft', { caseId, error: err?.message });
    }

    // ── Store internal note if provided ──────────────────────────────────
    if (internalNote) {
      try {
        db.prepare(`
          INSERT INTO case_notes
            (id, case_id, tenant_id, content, type, created_by, created_at)
          VALUES (?, ?, ?, ?, 'internal', 'composer-translator', ?)
        `).run(randomUUID(), caseId, tenantId, internalNote, now);
      } catch { /* table might not exist yet */ }
    }

    const costCredits = Math.ceil(tokensUsed / 1000);

    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `Composed ${tone}/${language} draft (${draft.length} chars)`,
      output: { tone, language, draftLength: draft.length, policyConstraints },
    };
  },
};
