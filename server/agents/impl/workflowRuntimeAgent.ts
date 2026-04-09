import { getDb } from '../../db/client.js';
import { logAudit, parseRow } from '../../db/utils.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface WorkflowAction {
  workflowId: string;
  workflowName: string;
  action: 'advance' | 'pause' | 'resume' | 'complete' | 'skip';
  detail: string;
}

function maxConflictSeverity(conflicts: Array<{ severity?: string }>): string {
  const order = ['low', 'medium', 'high', 'critical'];
  return conflicts.reduce((max, conflict) => {
    const severity = String(conflict.severity ?? 'low').toLowerCase();
    return order.indexOf(severity) > order.indexOf(max) ? severity : max;
  }, 'low');
}

export const workflowRuntimeAgentImpl: AgentImplementation = {
  slug: 'workflow-runtime-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, triggerEvent, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    const activeWorkflows = db.prepare(`
      SELECT wr.id as run_id, wr.workflow_version_id, wr.status as run_status,
             wr.current_node_id, wr.context as run_context,
             wd.name, wv.nodes, wv.edges, wv.status as workflow_status
      FROM workflow_runs wr
      JOIN workflow_versions wv ON wr.workflow_version_id = wv.id
      JOIN workflow_definitions wd ON wv.workflow_id = wd.id
      WHERE wr.case_id = ? AND wr.tenant_id = ?
        AND wr.status IN ('running', 'paused', 'waiting')
      ORDER BY wr.started_at DESC
    `).all(caseId, tenantId) as any[];

    if (activeWorkflows.length === 0) {
      return {
        success: true,
        confidence: 1,
        summary: 'No active workflows for this case',
        output: { workflowsChecked: 0, actionCount: 0 },
      };
    }

    const actions: WorkflowAction[] = [];
    const severity = maxConflictSeverity(contextWindow.conflicts);
    const shouldPauseForConflict = severity === 'high' || severity === 'critical';

    for (const wf of activeWorkflows) {
      const parsed = parseRow<any>(wf);
      const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const context = parseRow<any>({ context: wf.run_context }).context ?? {};
      const currentIndex = wf.current_node_id
        ? nodes.findIndex((node: any) => node.id === wf.current_node_id)
        : -1;

      if (triggerEvent === 'conflicts_detected' && wf.run_status === 'running') {
        if (shouldPauseForConflict) {
          try {
            db.prepare('UPDATE workflow_runs SET status = ?, context = ? WHERE id = ?')
              .run('paused', JSON.stringify({ ...context, paused_at: now, pause_reason: `${severity}_conflict_detected` }), wf.run_id);
            actions.push({
              workflowId: wf.run_id,
              workflowName: wf.name,
              action: 'pause',
              detail: `Paused due to ${severity}-severity conflict`,
            });
          } catch (err: any) {
            logger.error('Failed to pause workflow', { runId: wf.run_id, error: err?.message });
          }
        } else {
          actions.push({
            workflowId: wf.run_id,
            workflowName: wf.name,
            action: 'skip',
            detail: `Conflict severity ${severity} does not pause this workflow`,
          });
        }
        continue;
      }

      if (triggerEvent === 'case_resolved') {
        try {
          db.prepare('UPDATE workflow_runs SET status = ?, ended_at = ?, context = ? WHERE id = ?')
            .run('completed', now, JSON.stringify({ ...context, completed_at: now, completion_reason: 'case_resolved' }), wf.run_id);
          actions.push({
            workflowId: wf.run_id,
            workflowName: wf.name,
            action: 'complete',
            detail: 'Completed because case is resolved',
          });
        } catch (err: any) {
          logger.error('Failed to complete workflow', { runId: wf.run_id, error: err?.message });
        }
        continue;
      }

      if (wf.run_status === 'paused' && contextWindow.conflicts.length === 0) {
        try {
          db.prepare('UPDATE workflow_runs SET status = ?, context = ? WHERE id = ?')
            .run('running', JSON.stringify({ ...context, resumed_at: now, resume_reason: 'conflicts_cleared' }), wf.run_id);
          actions.push({
            workflowId: wf.run_id,
            workflowName: wf.name,
            action: 'resume',
            detail: 'Resumed after conflicts cleared',
          });
        } catch (err: any) {
          logger.error('Failed to resume workflow', { runId: wf.run_id, error: err?.message });
        }
      }

      if (wf.run_status === 'running' && nodes.length > 0 && contextWindow.case.approvalState !== 'pending') {
        const nextNode = currentIndex >= 0 ? nodes[currentIndex + 1] : nodes[0];
        if (nextNode) {
          try {
            db.prepare('UPDATE workflow_runs SET current_node_id = ?, context = ? WHERE id = ?')
              .run(nextNode.id, JSON.stringify({ ...context, advanced_at: now, current_node_label: nextNode.label ?? nextNode.id }), wf.run_id);
            actions.push({
              workflowId: wf.run_id,
              workflowName: wf.name,
              action: 'advance',
              detail: `Advanced to node ${nextNode.id}`,
            });
          } catch (err: any) {
            logger.error('Failed to advance workflow', { runId: wf.run_id, error: err?.message });
          }
        } else if (currentIndex >= nodes.length - 1) {
          try {
            db.prepare('UPDATE workflow_runs SET status = ?, ended_at = ?, context = ? WHERE id = ?')
              .run('completed', now, JSON.stringify({ ...context, completed_at: now, completion_reason: 'last_node_reached' }), wf.run_id);
            actions.push({
              workflowId: wf.run_id,
              workflowName: wf.name,
              action: 'complete',
              detail: 'Completed after reaching the last node',
            });
          } catch (err: any) {
            logger.error('Failed to finalize workflow', { runId: wf.run_id, error: err?.message });
          }
        }
      }
    }

    if (actions.length > 0) {
      try {
        logAudit(db, {
          tenantId,
          workspaceId: ctx.workspaceId,
          actorId: 'workflow-runtime-agent',
          actorType: 'system',
          action: 'WORKFLOW_RUNTIME_UPDATED',
          entityType: 'case',
          entityId: caseId,
          metadata: { actions, trigger: triggerEvent, agentRunId: runId, workflowCount: activeWorkflows.length },
        });
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
        severity,
        actions,
      },
    };
  },
};
