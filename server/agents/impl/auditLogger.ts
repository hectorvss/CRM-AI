import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const auditLoggerImpl: AgentImplementation = {
  slug: 'audit-logger',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: recentRunsData, error: recentRunsError } = await supabase
      .from('agent_runs')
      .select('agent_id, status, confidence, tokens_used, summary, started_at')
      .eq('case_id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .gte('started_at', new Date(Date.now() - 30_000).toISOString())
      .neq('id', runId)
      .order('started_at', { ascending: true });
    if (recentRunsError) throw recentRunsError;
    const recentRuns: any[] = recentRunsData ?? [];

    const snapshot = {
      caseId,
      caseNumber: contextWindow.case.caseNumber,
      status: contextWindow.case.status,
      priority: contextWindow.case.priority,
      riskScore: (contextWindow.case as any).riskScore ?? null,
      riskLevel: contextWindow.case.riskLevel,
      approvalState: contextWindow.case.approvalState,
      conflictCount: contextWindow.conflicts.length,
      triggerEvent,
    };

    try {
      const payload = {
        triggerEvent,
        agentsRan: recentRuns.map(r => ({
          agentId: r.agent_id,
          status: r.status,
          confidence: r.confidence,
          tokens: r.tokens_used,
          summary: r.summary,
        })),
        caseSnapshot: snapshot,
        auditRunId: runId,
      };

      const { error: auditError } = await supabase.from('audit_events').insert({
        id: randomUUID(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        actor_type: 'agent',
        action: `agent_chain_completed:${triggerEvent}`,
        entity_type: 'case',
        entity_id: caseId,
        new_value: `Agent chain completed for trigger "${triggerEvent}" — ${recentRuns.length} agents ran`,
        metadata: payload,
        occurred_at: now,
      });
      if (auditError) throw auditError;
      await supabase.from('cases')
        .update({ last_activity_at: now })
        .eq('id', caseId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
    } catch (err: any) {
      logger.error('Audit logger failed to write audit event', { caseId, error: err?.message });
      return { success: false, error: err?.message };
    }

    return {
      success: true,
      confidence: 1.0,
      summary: `Audit recorded: ${recentRuns.length} agents ran for "${triggerEvent}"`,
      output: {
        auditEventWritten: true,
        agentsInChain: recentRuns.length,
        triggerEvent,
      },
    };
  },
};
