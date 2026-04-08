/**
 * server/pipeline/draftReply.ts
 *
 * Draft Reply generator — Phase 5.
 *
 * Handles DRAFT_REPLY jobs. Uses Gemini + the full Context Window to generate
 * a polished, on-brand customer reply draft that the agent can review and send
 * (or edit) via the inbox copilot.
 *
 * The draft is:
 *  - Written in the same language as the customer's last message
 *  - Tone-matched (professional by default, or as specified in payload)
 *  - Policy-aware (references knowledge_articles relevant to the case type)
 *  - Conflict-aware (if conflicts exist, acknowledges delay without detail)
 *
 * Output: writes a draft_replies row with status='pending_review'.
 * An existing pending draft for the same case is replaced so the inbox always
 * shows the most up-to-date suggestion.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID }         from 'crypto';
import { getDb }              from '../db/client.js';
import { config }             from '../config.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import { buildContextWindow } from './contextWindow.js';
import type { DraftReplyPayload, JobContext } from '../queue/types.js';

// ── Knowledge article lookup ───────────────────────────────────────────────────

function fetchRelevantPolicies(caseType: string, tenantId: string): string {
  const db = getDb();
  const rows = db.prepare(`
    SELECT title, content FROM knowledge_articles
    WHERE tenant_id = ?
      AND (title LIKE ? OR title LIKE ? OR content LIKE ?)
      AND status = 'published'
    LIMIT 3
  `).all(
    tenantId,
    `%${caseType.replace(/_/g, ' ')}%`,
    `%refund%`,
    `%${caseType.split('_')[0]}%`,
  ) as any[];

  if (rows.length === 0) return '';
  return rows.map(r => `### ${r.title}\n${r.content}`).join('\n\n');
}

// ── Gemini draft generation ───────────────────────────────────────────────────

async function generateDraft(
  contextStr: string,
  policies: string,
  tone: string,
  hasConflicts: boolean,
): Promise<{ draft: string; confidence: number }> {
  const ai    = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

  const conflictNote = hasConflicts
    ? 'NOTE: There are active system conflicts. Do NOT mention refund amounts or delivery dates until resolved. Acknowledge the delay empathetically.'
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
- Be concise (3–5 sentences max for simple issues; up to 8 for complex ones).
- Do not invent facts. If you are unsure, say you are looking into it.
- End with a clear next step or ask if there's anything else.
- Tone: ${tone}

Reply:
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const draft  = result.response.text().trim();
    return { draft, confidence: 0.85 };
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

// ── Main handler ───────────────────────────────────────────────────────────────

async function handleDraftReply(
  payload: DraftReplyPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:   ctx.jobId,
    caseId:  payload.caseId,
    traceId: ctx.traceId,
  });

  const db       = getDb();
  const tenantId = ctx.tenantId ?? 'org_default';
  const tone     = payload.tone ?? 'professional';

  // ── 1. Load case ──────────────────────────────────────────────────────────
  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(payload.caseId) as any;
  if (!caseRow) {
    log.warn('Case not found for draft reply');
    return;
  }

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case closed, skipping draft generation');
    return;
  }

  // ── 2. Find conversation ──────────────────────────────────────────────────
  const conv = db.prepare('SELECT id FROM conversations WHERE case_id = ? LIMIT 1').get(payload.caseId) as any;
  if (!conv) {
    log.debug('No conversation linked to case, skipping draft');
    return;
  }

  // ── 3. Build context + fetch policies ─────────────────────────────────────
  log.info('Generating draft reply', { tone });

  const contextWindow = buildContextWindow(payload.caseId, tenantId);
  const contextStr    = contextWindow.toPromptString();
  const policies      = fetchRelevantPolicies(caseRow.type, tenantId);
  const hasConflicts  = caseRow.has_reconciliation_conflicts === 1;

  // ── 4. Generate draft ─────────────────────────────────────────────────────
  const { draft, confidence } = await generateDraft(contextStr, policies, tone, hasConflicts);

  // ── 5. Upsert draft_replies (replace existing pending draft) ─────────────
  const existingDraft = db.prepare(`
    SELECT id FROM draft_replies
    WHERE case_id = ? AND status = 'pending_review'
    LIMIT 1
  `).get(payload.caseId) as any;

  if (existingDraft) {
    db.prepare(`
      UPDATE draft_replies SET
        content       = ?,
        confidence    = ?,
        tone          = ?,
        has_policies  = ?,
        updated_at    = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      draft,
      confidence,
      tone,
      policies.length > 0 ? 1 : 0,
      existingDraft.id,
    );
    log.info('Draft reply updated', { draftId: existingDraft.id });
  } else {
    const draftId = randomUUID();
    db.prepare(`
      INSERT INTO draft_replies (
        id, case_id, conversation_id,
        content, generated_by, tone, confidence, has_policies,
        status, tenant_id
      ) VALUES (?, ?, ?, ?, 'draft_reply_agent', ?, ?, ?, 'pending_review', ?)
    `).run(
      draftId,
      payload.caseId,
      conv.id,
      draft,
      tone,
      confidence,
      policies.length > 0 ? 1 : 0,
      tenantId,
    );
    log.info('Draft reply created', { draftId });
  }

  // ── 6. Update case copilot readiness ──────────────────────────────────────
  db.prepare(`
    UPDATE cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(payload.caseId);
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.DRAFT_REPLY, handleDraftReply);

export { handleDraftReply };
