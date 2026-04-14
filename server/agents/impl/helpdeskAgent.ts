/**
 * server/agents/impl/helpdeskAgent.ts
 *
 * Helpdesk Agent â€” reads/writes tickets, tags, notes, and support metadata.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

async function writeInternalNote(
  useSupabase: boolean,
  db: ReturnType<typeof getDb> | null,
  supabase: ReturnType<typeof getSupabaseAdmin> | null,
  tenantId: string,
  workspaceId: string,
  caseId: string,
  content: string,
  now: string,
): Promise<void> {
  if (useSupabase) {
    const { error } = await supabase!.from('internal_notes').insert({
      id: randomUUID(),
      case_id: caseId,
      content,
      created_by: 'helpdesk-agent',
      created_by_type: 'human',
      created_at: now,
      tenant_id: tenantId,
      workspace_id: workspaceId,
    });
    if (error) throw error;
    return;
  }

  db!.prepare(`
    INSERT INTO internal_notes (id, case_id, content, created_by, created_by_type, created_at, tenant_id, workspace_id)
    VALUES (?, ?, ?, ?, 'human', ?, ?, ?)
  `).run(randomUUID(), caseId, content, 'helpdesk-agent', now, tenantId, workspaceId);
}

export const helpdeskAgentImpl: AgentImplementation = {
  slug: 'helpdesk-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();

    let conversation: any = null;
    if (useSupabase) {
      const { data, error } = await supabase!
        .from('conversations')
        .select('id, source_channel, external_thread_id')
        .eq('case_id', caseId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      conversation = data;
    } else {
      conversation = db!.prepare(`
        SELECT id, source_channel, external_thread_id
        FROM conversations WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(caseId, tenantId, workspaceId) as any;
    }

    let messageCount = 0;
    let latestInbound: string | null = null;
    let latestOutbound: string | null = null;

    if (conversation) {
      const msgStats = useSupabase
        ? (await supabase!.from('messages').select('type, sent_at').eq('conversation_id', conversation.id).eq('tenant_id', tenantId).eq('workspace_id', workspaceId)).data ?? []
        : db!.prepare(`
            SELECT type,
                   COUNT(*) as count,
                   MAX(sent_at) as latest
            FROM messages
            WHERE conversation_id = ? AND tenant_id = ? AND workspace_id = ?
            GROUP BY type
          `).all(conversation.id, tenantId, workspaceId) as any[];

      if (useSupabase) {
        for (const stat of msgStats as any[]) {
          messageCount++;
          if (stat.type === 'customer' || stat.type === 'inbound') latestInbound = stat.sent_at;
          else latestOutbound = stat.sent_at;
        }
      } else {
        for (const stat of msgStats) {
          messageCount += stat.count;
          if (stat.type === 'customer' || stat.type === 'inbound') latestInbound = stat.latest;
          else latestOutbound = stat.latest;
        }
      }
    }

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

    if (uniqueTags.length > 0) {
      try {
        if (useSupabase) {
          const { data: currentCase, error } = await supabase!
            .from('cases')
            .select('tags')
            .eq('id', caseId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId)
            .maybeSingle();
          if (error) throw error;
          const currentTags: string[] = JSON.parse(currentCase?.tags ?? '[]');
          const mergedTags = [...new Set([...currentTags, ...uniqueTags])];
          await supabase!.from('cases')
            .update({ tags: JSON.stringify(mergedTags), updated_at: now })
            .eq('id', caseId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
        } else {
          const currentCase = db!.prepare('SELECT tags FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(caseId, tenantId, workspaceId) as any;
          const currentTags: string[] = JSON.parse(currentCase?.tags ?? '[]');
          const mergedTags = [...new Set([...currentTags, ...uniqueTags])];
          db!.prepare('UPDATE cases SET tags = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?')
            .run(JSON.stringify(mergedTags), now, caseId, tenantId, workspaceId);
        }
      } catch {
        // non-critical
      }
    }

    if (triggerEvent === 'case_created' || triggerEvent === 'message_received') {
      try {
        const noteContent = triggerEvent === 'case_created'
          ? `Helpdesk sync: New case opened via ${conversation?.source_channel ?? 'unknown channel'}. ${messageCount} message(s) imported.`
          : `Helpdesk sync: New message received. Total ${messageCount} messages in thread.`;
        await writeInternalNote(useSupabase, db, supabase, tenantId, workspaceId, caseId, noteContent, now);
      } catch {
        // table might not exist yet
      }
    }

    return {
      success: true,
      confidence: 1.0,
      summary: `Helpdesk sync: ${messageCount} msgs, ${uniqueTags.length} auto-tag(s), channel=${conversation?.source_channel ?? 'unknown'}`,
      output: {
        conversationId: conversation?.id ?? null,
        channel: conversation?.source_channel ?? null,
        messageCount,
        latestInbound,
        latestOutbound,
        autoTags: uniqueTags,
      },
    };
  },
};
