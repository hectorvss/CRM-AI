/**
 * server/agents/impl/workflowRuntimeAgent.ts
 *
 * Workflow Runtime Agent — manages internal workflow progression
 * after reconciliation and execution.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface WorkflowAction {
  workflowId: string;
  workflowName: string;
  action: 'advance' | 'pause' | 'resume' | 'complete' | 'skip';
  detail: string;
}

export const workflowRuntimeAgentImpl: AgentImplementation = {
  slug: 'workflow-runtime-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, triggerEvent, runId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();

    const activeWorkflows = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('workflow_runs')
            .select('id as run_id, workflow_id, status as run_status, current_step, context as run_context, workflows(name, steps, status)')
            .eq('case_id', caseId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId)
            .in('status', ['running', 'paused', 'waiting'])
            .order('started_at', { ascending: false });
          if (error) throw error;
          return data ?? [];
        })()
      : db!.prepare(`
          SELECT wr.id as run_id, wr.workflow_id, wr.status as run_status,
                 wr.current_step, wr.context as run_context,
                 w.name, w.steps, w.status as workflow_status
          FROM workflow_runs wr
          JOIN workflows w ON wr.workflow_id = w.id
          WHERE wr.case_id = ? AND wr.tenant_id = ? AND wr.workspace_id = ?
            AND wr.status IN ('running', 'paused', 'waiting')
          ORDER BY wr.started_at DESC
        `).all(caseId, tenantId, workspaceId) as any[];

    if (activeWorkflows.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No active workflows for this case',
        output: { workflowsChecked: 0 },
      };
    }

    const actions: WorkflowAction[] = [];

    for (const wf of activeWorkflows as any[]) {
      const workflow = wf.workflows ?? wf;
      const steps = typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : (workflow.steps ?? []);
      const currentStep = wf.current_step ?? 0;

      if (triggerEvent === 'conflicts_detected') {
        const maxSeverity = (contextWindow.conflicts || []).reduce((max: string, c: any) => {
          const order = ['low', 'medium', 'high', 'critical'];
          return order.indexOf(c.severity) > order.indexOf(max) ? c.severity : max;
        }, 'low');
        const shouldPause = maxSeverity === 'high' || maxSeverity === 'critical';

        if (wf.run_status === 'running' && shouldPause) {
          try {
            if (useSupabase) {
              const { error } = await supabase!.from('workflow_runs').update({ status: 'paused', updated_at: now }).eq('id', wf.run_id);
              if (error) throw error;
            } else {
              db!.prepare('UPDATE workflow_runs SET status = ?, updated_at = ? WHERE id = ?').run('paused', now, wf.run_id);
            }
            actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'pause', detail: `Paused due to ${maxSeverity}-severity conflict` });
          } catch { /* non-critical */ }
        } else if (wf.run_status === 'running' && !shouldPause) {
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'skip', detail: `Conflict severity ${maxSeverity} — workflow continues` });
        }
      }

      if (triggerEvent === 'case_resolved') {
        try {
          if (useSupabase) {
            const { error } = await supabase!.from('workflow_runs').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', wf.run_id);
            if (error) throw error;
          } else {
            db!.prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run('completed', now, now, wf.run_id);
          }
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'complete', detail: 'Completed — case resolved' });
        } catch { /* non-critical */ }
        continue;
      }

      if (wf.run_status === 'paused' && contextWindow.conflicts.length === 0) {
        try {
          if (useSupabase) {
            const { error } = await supabase!.from('workflow_runs').update({ status: 'running', updated_at: now }).eq('id', wf.run_id);
            if (error) throw error;
          } else {
            db!.prepare('UPDATE workflow_runs SET status = ?, updated_at = ? WHERE id = ?').run('running', now, wf.run_id);
          }
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'resume', detail: 'Resumed — conflicts resolved' });
        } catch { /* non-critical */ }
      }

      if (wf.run_status === 'running' && steps.length > 0 && currentStep < steps.length - 1) {
        const nextStep = currentStep + 1;
        if (contextWindow.case.approvalState !== 'pending') {
          try {
            if (useSupabase) {
              const { error } = await supabase!.from('workflow_runs').update({ current_step: nextStep, updated_at: now }).eq('id', wf.run_id);
              if (error) throw error;
            } else {
              db!.prepare('UPDATE workflow_runs SET current_step = ?, updated_at = ? WHERE id = ?').run(nextStep, now, wf.run_id);
            }
            actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'advance', detail: `Advanced to step ${nextStep + 1}/${steps.length}` });
          } catch { /* non-critical */ }
        }
      }

      if (wf.run_status === 'running' && currentStep >= steps.length - 1 && steps.length > 0) {
        try {
          if (useSupabase) {
            const { error } = await supabase!.from('workflow_runs').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', wf.run_id);
            if (error) throw error;
          } else {
            db!.prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run('completed', now, now, wf.run_id);
          }
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'complete', detail: 'All steps completed' });
        } catch { /* non-critical */ }
      }
    }

    if (actions.length > 0) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: 'workflow_runtime',
            entity_type: 'case',
            entity_id: caseId,
            new_value: `Workflow runtime: ${actions.length} action(s) on ${activeWorkflows.length} workflow(s)`,
            metadata: { actions, trigger: triggerEvent, agentRunId: runId },
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
          `).run(
            randomUUID(), tenantId, workspaceId,
            'workflow_runtime',
            caseId,
            `Workflow runtime: ${actions.length} action(s) on ${activeWorkflows.length} workflow(s)`,
            JSON.stringify({ actions, trigger: triggerEvent, agentRunId: runId }),
            now,
          );
        }
      } catch (err: any) {
        logger.error('Workflow runtime audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 0.95,
      summary: `Workflow runtime: ${activeWorkflows.length} workflow(s), ${actions.length} action(s)`,
      output: {
        workflowsChecked: activeWorkflows.length,
        actionCount: actions.length,
        actions,
      },
    };
  },
};
