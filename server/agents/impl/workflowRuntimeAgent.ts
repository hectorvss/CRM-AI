/**
 * server/agents/impl/workflowRuntimeAgent.ts
 *
 * Workflow Runtime Agent — manages internal workflow progression
 * after reconciliation and execution.
 */

import { randomUUID } from 'crypto';
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
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: activeWorkflowsData, error: activeWorkflowsError } = await supabase
      .from('workflow_runs')
      .select('id as run_id, workflow_id, status as run_status, current_step, context as run_context, workflows(name, steps, status)')
      .eq('case_id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .in('status', ['running', 'paused', 'waiting'])
      .order('started_at', { ascending: false });
    if (activeWorkflowsError) throw activeWorkflowsError;
    const activeWorkflows: any[] = activeWorkflowsData ?? [];

    if (activeWorkflows.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No active workflows for this case',
        output: { workflowsChecked: 0 },
      };
    }

    const actions: WorkflowAction[] = [];

    for (const wf of activeWorkflows) {
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
            const { error } = await supabase.from('workflow_runs').update({ status: 'paused', updated_at: now }).eq('id', wf.run_id);
            if (error) throw error;
            actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'pause', detail: `Paused due to ${maxSeverity}-severity conflict` });
          } catch { /* non-critical */ }
        } else if (wf.run_status === 'running' && !shouldPause) {
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'skip', detail: `Conflict severity ${maxSeverity} — workflow continues` });
        }
      }

      if (triggerEvent === 'case_resolved') {
        try {
          const { error } = await supabase.from('workflow_runs').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', wf.run_id);
          if (error) throw error;
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'complete', detail: 'Completed — case resolved' });
        } catch { /* non-critical */ }
        continue;
      }

      if (wf.run_status === 'paused' && contextWindow.conflicts.length === 0) {
        try {
          const { error } = await supabase.from('workflow_runs').update({ status: 'running', updated_at: now }).eq('id', wf.run_id);
          if (error) throw error;
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'resume', detail: 'Resumed — conflicts resolved' });
        } catch { /* non-critical */ }
      }

      if (wf.run_status === 'running' && steps.length > 0 && currentStep < steps.length - 1) {
        const nextStep = currentStep + 1;
        if (contextWindow.case.approvalState !== 'pending') {
          try {
            const { error } = await supabase.from('workflow_runs').update({ current_step: nextStep, updated_at: now }).eq('id', wf.run_id);
            if (error) throw error;
            actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'advance', detail: `Advanced to step ${nextStep + 1}/${steps.length}` });
          } catch { /* non-critical */ }
        }
      }

      if (wf.run_status === 'running' && currentStep >= steps.length - 1 && steps.length > 0) {
        try {
          const { error } = await supabase.from('workflow_runs').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', wf.run_id);
          if (error) throw error;
          actions.push({ workflowId: wf.run_id, workflowName: workflow.name, action: 'complete', detail: 'All steps completed' });
        } catch { /* non-critical */ }
      }
    }

    if (actions.length > 0) {
      try {
        const { error } = await supabase.from('audit_events').insert({
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
