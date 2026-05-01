import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { enqueue } from '../../queue/client.js';
import { JobType } from '../../queue/types.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const draftReplyAgentImpl: AgentImplementation = {
  slug: 'draft-reply-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, traceId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;

    let existing: { id: string } | undefined;
    if (useSupabase) {
      const { data, error } = await supabase!
        .from('draft_replies')
        .select('id')
        .eq('case_id', caseId)
        .eq('status', 'pending_review')
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existing = data ?? undefined;
    } else {
      existing = db!.prepare(`
        SELECT id FROM draft_replies
        WHERE case_id = ? AND status = 'pending_review' AND tenant_id = ? AND workspace_id = ?
        ORDER BY generated_at DESC LIMIT 1
      `).get(caseId, tenantId, workspaceId) as { id: string } | undefined;
    }

    if (existing) {
      return {
        success: true,
        confidence: 1.0,
        summary: `Draft reply already pending (${existing.id}) — skipping generation`,
        output: { draftReplyId: existing.id, skipped: true },
      };
    }

    let tone: 'professional' | 'friendly' | 'empathetic' = 'professional';
    const { customer, conflicts } = contextWindow;
    if (customer?.segment === 'vip' || conflicts.length > 0) tone = 'empathetic';
    else if (contextWindow.case.priority === 'normal' || contextWindow.case.priority === 'low') tone = 'friendly';

    try {
      await enqueue(
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
