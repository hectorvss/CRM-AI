import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { pickGeminiModel } from '../ai/modelSelector.js';
import { SAAS_PRODUCT_CONTEXT } from '../ai/systemContext.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { config } from '../config.js';
import { registerHandler } from '../queue/handlers/index.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import { buildContextWindow } from './contextWindow.js';
import { resolveAgentKnowledgeBundle } from '../services/agentKnowledge.js';
import { requireScope } from '../lib/scope.js';
import type { DraftReplyPayload, JobContext } from '../queue/types.js';

async function generateDraft(
  contextStr: string,
  policies: string,
  tone: string,
  hasConflicts: boolean,
): Promise<{ draft: string; confidence: number }> {
  const ai = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = ai.getGenerativeModel({ model: pickGeminiModel('draft_reply', config.ai.geminiModel) });

  const conflictNote = hasConflicts
    ? 'NOTE: There are active system conflicts. Do not mention final refund amounts or delivery dates until reconciled. Acknowledge the delay empathetically.'
    : '';

  const prompt = `${SAAS_PRODUCT_CONTEXT}

# Your role this turn — Customer-facing reply draft

You are drafting a message that will be sent TO THE CUSTOMER on behalf of the support team. The human agent will review and may edit before sending. Write the reply body only, in plain prose, ready to ship.

Tone for this draft: ${tone}.

# Context for the case

${contextStr}

${policies ? `Relevant policies you must respect (do NOT promise anything outside these):\n${policies}\n` : ''}
${conflictNote}

# Hard rules

- Write ONLY the reply body. No subject, no headers, no signature.
- Match the customer's language (look at their last message).
- Be concise: 3–5 short sentences for simple issues, up to 8 only when the situation truly needs it.
- Never invent facts. If something isn't in the case context, say you're looking into it.
- Use real IDs/amounts from the context when relevant. Never round refunds or fabricate timelines.
- End with a clear next step ("you'll see the refund in 3–5 business days", "let me know if your address changed", etc.).
- No corporate filler ("Thank you for your patience and understanding…").
- Do not start with "Hi [Name]" unless the agent's tone column says formal. A lowercase opening is fine for casual tones.

Reply body:`;

  try {
    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'draft.reply' },
    );
    return {
      draft: result.response.text().trim(),
      confidence: 0.85,
    };
  } catch (err) {
    logger.warn('Draft generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      draft: 'Thank you for reaching out. We have received your message and our team is looking into this. We will get back to you as soon as possible.',
      confidence: 0.2,
    };
  }
}

async function handleDraftReply(payload: DraftReplyPayload, ctx: JobContext): Promise<void> {
  const log = logger.child({
    jobId: ctx.jobId,
    caseId: payload.caseId,
    traceId: ctx.traceId,
  });

  const supabase = getSupabaseAdmin();
  const { tenantId, workspaceId } = requireScope(ctx, 'draftReply');
  const tone = payload.tone ?? 'professional';

  // 1. Load case
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', payload.caseId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single();

  if (caseErr || !caseRow) {
    log.warn('Case not found for draft reply');
    return;
  }

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case closed, skipping draft generation');
    return;
  }

  // 2. Get linked conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('case_id', payload.caseId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .limit(1)
    .single();

  if (!conversation) {
    log.debug('No conversation linked to case, skipping draft');
    return;
  }

  log.info('Generating draft reply', { tone });

  const contextWindow = await buildContextWindow(payload.caseId, tenantId, workspaceId);
  if (!contextWindow) {
    log.warn('No context window available for draft reply');
    return;
  }

  // 3. Load composer agent knowledge profile
  const { data: composerAgent } = await supabase
    .from('agents')
    .select('agent_versions!agents_current_version_id_fkey(knowledge_profile)')
    .eq('slug', 'composer-translator')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .single();

  const knowledgeProfile = (composerAgent as any)?.agent_versions?.knowledge_profile
    ? (typeof (composerAgent as any).agent_versions.knowledge_profile === 'string'
      ? JSON.parse((composerAgent as any).agent_versions.knowledge_profile)
      : (composerAgent as any).agent_versions.knowledge_profile)
    : {};

  const knowledgeBundle = await resolveAgentKnowledgeBundle({
    tenantId,
    workspaceId,
    knowledgeProfile,
    caseContext: {
      type: contextWindow.case.type,
      intent: contextWindow.case.intent,
      tags: contextWindow.case.tags,
      customerSegment: contextWindow.customer?.segment ?? null,
      conflictDomains: contextWindow.conflicts.map((conflict) => conflict.domain),
      latestMessage: contextWindow.messages.at(-1)?.content ?? null,
    },
  });

  const { draft, confidence } = await generateDraft(
    contextWindow.toPromptString(),
    knowledgeBundle.promptContext,
    tone,
    caseRow.has_reconciliation_conflicts === true || caseRow.has_reconciliation_conflicts === 1,
  );

  const citations = JSON.stringify(knowledgeBundle.citations);
  const hasPolicies = knowledgeBundle.citations.length > 0;
  const now = new Date().toISOString();

  // 4. Upsert draft reply
  const { data: existingDraft } = await supabase
    .from('draft_replies')
    .select('id')
    .eq('case_id', payload.caseId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending_review')
    .limit(1)
    .single();

  if (existingDraft) {
    await supabase
      .from('draft_replies')
      .update({
        content: draft,
        confidence,
        tone,
        has_policies: hasPolicies,
        citations,
        updated_at: now,
      })
      .eq('id', existingDraft.id)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
    log.info('Draft reply updated', { draftId: existingDraft.id });
  } else {
    const draftId = randomUUID();
    await supabase.from('draft_replies').insert({
      id: draftId,
      case_id: payload.caseId,
      conversation_id: conversation.id,
      content: draft,
      generated_by: 'draft_reply_agent',
      tone,
      confidence,
      has_policies: hasPolicies,
      citations,
      status: 'pending_review',
      tenant_id: tenantId,
      workspace_id: workspaceId,
    });
    log.info('Draft reply created', { draftId });
  }

  // 5. Touch case updated_at
  await supabase
    .from('cases')
    .update({ updated_at: now })
    .eq('id', payload.caseId);
}

registerHandler(JobType.DRAFT_REPLY, handleDraftReply);

export { handleDraftReply };
