import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const auditLoggerImpl: AgentImplementation = {
  slug: 'audit-logger',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();

    let recentRuns: any[] = [];
    if (useSupabase) {
      const { data, error } = await supabase!
        .from('agent_runs')
        .select('agent_id, status, confidence, tokens_used, summary, started_at')
        .eq('case_id', caseId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .gte('started_at', new Date(Date.now() - 30_000).toISOString())
        .neq('id', runId)
        .order('started_at', { ascending: true });
      if (error) throw error;
      recentRuns = data ?? [];
    } else {
      recentRuns = db!.prepare(`
        SELECT agent_id, status, confidence, tokens_used, summary, started_at
        FROM agent_runs
        WHERE case_id = ? AND tenant_id = ?
          AND workspace_id = ?
          AND started_at >= datetime('now', '-30 seconds')
          AND id != ?
        ORDER BY started_at ASC
      `).all(caseId, tenantId, workspaceId, runId) as any[];
    }

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

      if (useSupabase) {
        const { error } = await supabase!.from('audit_events').insert({
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
        if (error) throw error;
        await supabase!.from('cases')
          .update({ last_activity_at: now })
          .eq('id', caseId)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId);
      } else {
        db!.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
          VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
        `).run(
          randomUUID(),
          tenantId,
          workspaceId,
          `agent_chain_completed:${triggerEvent}`,
          caseId,
          `Agent chain completed for trigger "${triggerEvent}" — ${recentRuns.length} agents ran`,
          JSON.stringify(payload),
          now,
        );
        db!.prepare('UPDATE cases SET last_activity_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?')
          .run(now, caseId, tenantId, workspaceId);
      }
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
