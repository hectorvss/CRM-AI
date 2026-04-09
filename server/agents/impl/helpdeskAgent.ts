/**
 * server/agents/impl/helpdeskAgent.ts
 *
 * Helpdesk Agent — reads/writes tickets, tags, notes, and support
 * metadata in the helpdesk system.
 *
 * Synchronizes support-side thread state with the canonical case:
 *   - Reads conversation messages and extracts tags/sentiment
 *   - Writes internal notes summarizing agent actions
 *   - Updates case tags based on conversation content
 *
 * No Gemini — pure DB reads/writes.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const helpdeskAgentImpl: AgentImplementation = {
  slug: 'helpdesk-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    // ── 1. Sync conversation metadata ────────────────────────────────────
    const conversation = db.prepare(`
      SELECT id, channel, external_thread_id
      FROM conversations WHERE case_id = ? AND tenant_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(caseId, tenantId) as any;

    let messageCount = 0;
    let latestInbound: string | null = null;
    let latestOutbound: string | null = null;

    if (conversation) {
      const msgStats = db.prepare(`
        SELECT type,
               COUNT(*) as count,
               MAX(sent_at) as latest
        FROM messages
        WHERE conversation_id = ?
        GROUP BY type
      `).all(conversation.id) as any[];

      for (const stat of msgStats) {
        messageCount += stat.count;
        if (stat.type === 'customer' || stat.type === 'inbound') {
          latestInbound = stat.latest;
        } else {
          latestOutbound = stat.latest;
        }
      }
    }

    // ── 2. Extract tags from messages ────────────────────────────────────
    const autoTags: string[] = [];
    for (const msg of contextWindow.messages) {
      const content = msg.content.toLowerCase();
      if (content.includes('refund')) autoTags.push('refund');
      if (content.includes('cancel')) autoTags.push('cancellation');
      if (content.includes('urgent') || content.includes('asap')) autoTags.push('urgent');
      if (content.includes('damaged') || content.includes('broken')) autoTags.push('damaged_item');
      if (content.includes('wrong item') || content.includes('incorrect')) autoTags.push('wrong_item');
      if (content.includes('tracking') || content.includes('shipment')) autoTags.push('shipping');
      if (content.includes('subscription') || content.includes('renewal')) autoTags.push('subscription');
    }

    const uniqueTags = [...new Set(autoTags)];

    // ── 3. Merge tags into case ──────────────────────────────────────────
    if (uniqueTags.length > 0) {
      try {
        const currentCase = db.prepare('SELECT tags FROM cases WHERE id = ?').get(caseId) as any;
        const currentTags: string[] = JSON.parse(currentCase?.tags ?? '[]');
        const mergedTags = [...new Set([...currentTags, ...uniqueTags])];

        db.prepare('UPDATE cases SET tags = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
          .run(JSON.stringify(mergedTags), now, caseId, tenantId);
      } catch { /* non-critical */ }
    }

    // ── 4. Write internal note for agent actions ─────────────────────────
    if (triggerEvent === 'case_created' || triggerEvent === 'message_received') {
      try {
        const noteContent = triggerEvent === 'case_created'
          ? `Helpdesk sync: New case opened via ${conversation?.channel ?? 'unknown channel'}. ${messageCount} message(s) imported.`
          : `Helpdesk sync: New message received. Total ${messageCount} messages in thread.`;

        db.prepare(`
          INSERT INTO internal_notes
            (id, case_id, content, created_by, created_by_type, created_at, tenant_id)
          VALUES (?, ?, ?, 'helpdesk-agent', 'agent', ?, ?)
        `).run(randomUUID(), caseId, noteContent, now, tenantId);
      } catch { /* table might not exist yet */ }
    }

    return {
      success: true,
      confidence: 1.0,
      summary: `Helpdesk sync: ${messageCount} msgs, ${uniqueTags.length} auto-tag(s), channel=${conversation?.channel ?? 'unknown'}`,
      output: {
        conversationId: conversation?.id ?? null,
        channel: conversation?.channel ?? null,
        messageCount,
        latestInbound,
        latestOutbound,
        autoTags: uniqueTags,
      },
    };
  },
};
