/**
 * server/agents/impl/helpdeskAgent.ts
 *
 * Helpdesk Agent — reads/writes tickets, tags, notes, and support metadata.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

async function writeInternalNote(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  workspaceId: string,
  caseId: string,
  content: string,
  now: string,
): Promise<void> {
  const { error } = await supabase.from('internal_notes').insert({
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
}

export const helpdeskAgentImpl: AgentImplementation = {
  slug: 'helpdesk-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: conversationData, error: conversationError } = await supabase
      .from('conversations')
      .select('id, source_channel, external_thread_id')
      .eq('case_id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conversationError) throw conversationError;
    const conversation = conversationData;

    let messageCount = 0;
    let latestInbound: string | null = null;
    let latestOutbound: string | null = null;

    if (conversation) {
      // messages has no workspace_id column; conversation_id is enough since
      // conversations are workspace-scoped and FK back to this conversation.
      const { data: msgStatsData, error: msgStatsError } = await supabase
        .from('messages')
        .select('type, sent_at')
        .eq('conversation_id', conversation.id)
        .eq('tenant_id', tenantId);
      if (msgStatsError) throw msgStatsError;
      const msgStats = msgStatsData ?? [];

      for (const stat of msgStats as any[]) {
        messageCount++;
        if (stat.type === 'customer' || stat.type === 'inbound') latestInbound = stat.sent_at;
        else latestOutbound = stat.sent_at;
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
        const { data: currentCase, error } = await supabase
          .from('cases')
          .select('tags')
          .eq('id', caseId)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (error) throw error;
        const currentTags: string[] = JSON.parse(currentCase?.tags ?? '[]');
        const mergedTags = [...new Set([...currentTags, ...uniqueTags])];
        await supabase.from('cases')
          .update({ tags: JSON.stringify(mergedTags), updated_at: now })
          .eq('id', caseId)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId);
      } catch {
        // non-critical
      }
    }

    if (triggerEvent === 'case_created' || triggerEvent === 'message_received') {
      try {
        const noteContent = triggerEvent === 'case_created'
          ? `Helpdesk sync: New case opened via ${conversation?.source_channel ?? 'unknown channel'}. ${messageCount} message(s) imported.`
          : `Helpdesk sync: New message received. Total ${messageCount} messages in thread.`;
        await writeInternalNote(supabase, tenantId, workspaceId, caseId, noteContent, now);
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
