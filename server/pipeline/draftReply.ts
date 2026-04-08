import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { registerHandler } from '../queue/handlers/index.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import { buildContextWindow } from './contextWindow.js';
import { resolveAgentKnowledgeBundle } from '../services/agentKnowledge.js';
import type { DraftReplyPayload, JobContext } from '../queue/types.js';

async function generateDraft(
  contextStr: string,
  policies: string,
  tone: string,
  hasConflicts: boolean,
): Promise<{ draft: string; confidence: number }> {
  const ai = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

  const conflictNote = hasConflicts
    ? 'NOTE: There are active system conflicts. Do not mention final refund amounts or delivery dates until reconciled. Acknowledge the delay empathetically.'
    : '';

  const prompt = `
You are a customer support agent writing a reply on behalf of the support team.
Write a ${tone} response to the customer based on the case context below.

CASE CONTEXT:
${contextStr}

${policies ? `RELEVANT POLICIES:\n${policies}` : ''}

${conflictNote}

INSTRUCTIONS:
- Write ONLY the reply body. No subject line, no metadata.
- Match the language of the customer's last message.
- Be concise (3-5 sentences max for simple issues; up to 8 for complex ones).
- Do not invent facts. If you are unsure, say you are looking into it.
- End with a clear next step or ask if there's anything else.
- Tone: ${tone}

Reply:
`.trim();

  try {
    const result = await model.generateContent(prompt);
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

  const db = getDb();
  const tenantId = ctx.tenantId ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';
  const tone = payload.tone ?? 'professional';

  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(payload.caseId) as any;
  if (!caseRow) {
    log.warn('Case not found for draft reply');
    return;
  }

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case closed, skipping draft generation');
    return;
  }

  const conversation = db.prepare('SELECT id FROM conversations WHERE case_id = ? LIMIT 1').get(payload.caseId) as any;
  if (!conversation) {
    log.debug('No conversation linked to case, skipping draft');
    return;
  }

  log.info('Generating draft reply', { tone });

  const contextWindow = buildContextWindow(payload.caseId, tenantId);
  const composerAgent = db.prepare(`
    SELECT av.knowledge_profile
    FROM agents a
    LEFT JOIN agent_versions av ON a.current_version_id = av.id
    WHERE a.slug = 'composer-translator' AND a.tenant_id = ? AND a.is_active = 1
    LIMIT 1
  `).get(tenantId) as any;

  const knowledgeProfile = composerAgent?.knowledge_profile
    ? JSON.parse(composerAgent.knowledge_profile)
    : {};

  const knowledgeBundle = resolveAgentKnowledgeBundle({
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
    caseRow.has_reconciliation_conflicts === 1,
  );

  const citations = JSON.stringify(knowledgeBundle.citations);
  const hasPolicies = knowledgeBundle.citations.length > 0 ? 1 : 0;
  const existingDraft = db.prepare(`
    SELECT id FROM draft_replies
    WHERE case_id = ? AND status = 'pending_review'
    LIMIT 1
  `).get(payload.caseId) as any;

  if (existingDraft) {
    db.prepare(`
      UPDATE draft_replies SET
        content = ?,
        confidence = ?,
        tone = ?,
        has_policies = ?,
        citations = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      draft,
      confidence,
      tone,
      hasPolicies,
      citations,
      existingDraft.id,
    );
    log.info('Draft reply updated', { draftId: existingDraft.id });
  } else {
    const draftId = randomUUID();
    db.prepare(`
      INSERT INTO draft_replies (
        id, case_id, conversation_id, content, generated_by, tone,
        confidence, has_policies, citations, status, tenant_id
      ) VALUES (?, ?, ?, ?, 'draft_reply_agent', ?, ?, ?, ?, 'pending_review', ?)
    `).run(
      draftId,
      payload.caseId,
      conversation.id,
      draft,
      tone,
      confidence,
      hasPolicies,
      citations,
      tenantId,
    );
    log.info('Draft reply created', { draftId });
  }

  db.prepare(`
    UPDATE cases
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.caseId);
}

registerHandler(JobType.DRAFT_REPLY, handleDraftReply);

export { handleDraftReply };
