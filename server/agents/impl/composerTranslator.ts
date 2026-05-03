/**
 * server/agents/impl/composerTranslator.ts
 *
 * Composer + Translator Agent — drafts and localizes internal and
 * customer-facing messages.
 */

import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const composerTranslatorImpl: AgentImplementation = {
  slug: 'composer-translator',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, knowledgeBundle, tenantId, workspaceId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();

    const isResolution = triggerEvent === 'case_resolved';
    const hasConflicts = contextWindow.conflicts.length > 0;
    const customerName = contextWindow.customer?.name ?? 'Customer';
    const lastMessage = contextWindow.messages[contextWindow.messages.length - 1];
    const messageText = lastMessage?.content ?? '';
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
  "language": "en" | "es" | "fr" | "de",
  "internalNote": "Brief internal note for the support team (optional)",
  "confidence": 0.0 to 1.0,
  "policyConstraints": ["any policy rules applied to this draft"]
}`;

    let output: any;
    let tokensUsed = 0;

    try {
      const model = gemini.getGenerativeModel({
        model: reasoning.model,
        generationConfig: { temperature: reasoning.temperature, maxOutputTokens: reasoning.maxOutputTokens, responseMimeType: 'application/json' },
      });
      const response = await withGeminiRetry(() => model.generateContent(prompt), { label: 'composer-translator' });
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      output = JSON.parse(text);
    } catch (err: any) {
      logger.error('Composer agent Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const { draft, tone, language, internalNote, confidence, policyConstraints = [] } = output;
    if (!draft) return { success: false, error: 'Composer output missing draft field', tokensUsed };

    const now = new Date().toISOString();
    try {
      const { error } = await supabase.from('draft_replies').insert({
        id: randomUUID(),
        case_id: caseId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        content: draft,
        generated_by: 'composer-translator',
        tone: tone ?? 'professional',
        confidence,
        has_policies: policyConstraints.length > 0 ? 1 : 0,
        citations: JSON.stringify(knowledgeBundle.citations),
        status: 'pending_review',
        generated_at: now,
      });
      if (error) throw error;
    } catch (err: any) {
      logger.error('Failed to store composed draft', { caseId, error: err?.message });
    }

    if (internalNote) {
      try {
        const { error } = await supabase.from('internal_notes').insert({
          id: randomUUID(),
          case_id: caseId,
          content: internalNote,
          created_by: 'composer-translator',
          created_by_type: 'system',
          created_at: now,
          tenant_id: tenantId,
          workspace_id: workspaceId,
        });
        if (error) throw error;
      } catch { /* non-critical */ }
    }

    try {
      const { error } = await supabase.from('audit_events').insert({
        id: randomUUID(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        actor_type: 'system',
        action: 'DRAFT_COMPOSED',
        entity_type: 'case',
        entity_id: caseId,
        metadata: { tone, language, policyConstraints, hasInternalNote: Boolean(internalNote) },
        occurred_at: now,
      });
      if (error) throw error;
    } catch { /* non-critical */ }

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
