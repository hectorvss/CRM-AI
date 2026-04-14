/**
 * server/agents/impl/draftReplyAgent.ts
 *
 * Draft Reply Agent — generates an AI-drafted customer reply.
 *
 * This is the agent-engine wrapper around the existing draftReply pipeline.
 * Rather than duplicating the Gemini prompt logic, it enqueues a DRAFT_REPLY
 * job if one isn't already pending — this keeps the pipeline idempotent.
 *
 * If a draft already exists (pending_review), the agent returns success
 * without creating a duplicate.
 */

import { getDb } from '../../db/client.js';
import { enqueue } from '../../queue/client.js';
import { JobType } from '../../queue/types.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const draftReplyAgentImpl: AgentImplementation = {
  slug: 'draft-reply-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, traceId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    // ── Check if draft already pending ───────────────────────────────────
    const existing = db.prepare(`
      SELECT id FROM draft_replies
      WHERE case_id = ? AND status = 'pending_review'
      ORDER BY generated_at DESC LIMIT 1
    `).get(caseId) as { id: string } | undefined;

    if (existing) {
      return {
        success: true,
        confidence: 1.0,
        summary: `Draft reply already pending (${existing.id}) — skipping generation`,
        output: { draftReplyId: existing.id, skipped: true },
      };
    }

    // ── Determine appropriate tone from context ───────────────────────────
    let tone: 'professional' | 'friendly' | 'empathetic' = 'professional';
    const { customer, conflicts } = contextWindow;

    if (customer?.segment === 'vip') {
      tone = 'empathetic';
    } else if (conflicts.length > 0) {
      tone = 'empathetic';
    } else if (contextWindow.case.priority === 'normal' || contextWindow.case.priority === 'low') {
      tone = 'friendly';
    }

    // ── Enqueue DRAFT_REPLY job ───────────────────────────────────────────
    try {
      enqueue(
        JobType.DRAFT_REPLY,
        { caseId, tone },
        { tenantId, workspaceId, traceId, priority: 6 },
      );
    } catch (err: any) {
      logger.error('Draft reply agent failed to enqueue DRAFT_REPLY', { caseId, error: err?.message });
      return { success: false, error: err?.message };
    }

    return {
      success: true,
      confidence: 0.9,
      summary: `Draft reply enqueued with tone "${tone}"`,
      output: { tone, enqueued: true },
    };
  },
};
