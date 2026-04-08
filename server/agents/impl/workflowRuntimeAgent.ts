/**
 * server/agents/impl/workflowRuntimeAgent.ts
 *
 * Workflow Runtime Agent — manages internal workflow progression
 * after reconciliation and execution.
 *
 * Advances, pauses, resumes and unblocks internal workflow state
 * as external execution completes:
 *   - Checks active workflows for the case
 *   - Advances workflow steps based on case state changes
 *   - Pauses workflows when conflicts are detected
 *   - Resumes workflows when conflicts are resolved
 *
 * No Gemini — pure DB state machine logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
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
    const { contextWindow, tenantId, triggerEvent, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    // ── 1. Find active workflows for this case ───────────────────────────
    const activeWorkflows = db.prepare(`
      SELECT wr.id as run_id, wr.workflow_id, wr.status as run_status,
             wr.current_step, wr.context as run_context,
             w.name, w.steps, w.status as workflow_status
      FROM workflow_runs wr
      JOIN workflows w ON wr.workflow_id = w.id
      WHERE wr.case_id = ? AND wr.tenant_id = ?
        AND wr.status IN ('running', 'paused', 'waiting')
      ORDER BY wr.started_at DESC
    `).all(caseId, tenantId) as any[];

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
      const steps = typeof wf.steps === 'string' ? JSON.parse(wf.steps) : (wf.steps ?? []);
      const currentStep = wf.current_step ?? 0;

      // ── Handle based on trigger event ──────────────────────────────
      if (triggerEvent === 'conflicts_detected') {
        // Pause running workflows when conflicts are found
        if (wf.run_status === 'running') {
          try {
            db.prepare('UPDATE workflow_runs SET status = ?, updated_at = ? WHERE id = ?')
              .run('paused', now, wf.run_id);
            actions.push({
              workflowId: wf.run_id,
              workflowName: wf.name,
              action: 'pause',
              detail: 'Paused due to conflicts detected',
            });
          } catch { /* non-critical */ }
        }
      }

      if (triggerEvent === 'case_resolved') {
        // Complete any running/paused workflows when case is resolved
        try {
          db.prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
            .run('completed', now, now, wf.run_id);
          actions.push({
            workflowId: wf.run_id,
            workflowName: wf.name,
            action: 'complete',
            detail: 'Completed — case resolved',
          });
        } catch { /* non-critical */ }
        continue;
      }

      // ── Try to advance paused workflows if conflicts are resolved ──
      if (wf.run_status === 'paused' && contextWindow.conflicts.length === 0) {
        try {
          db.prepare('UPDATE workflow_runs SET status = ?, updated_at = ? WHERE id = ?')
            .run('running', now, wf.run_id);
          actions.push({
            workflowId: wf.run_id,
            workflowName: wf.name,
            action: 'resume',
            detail: 'Resumed — conflicts resolved',
          });
        } catch { /* non-critical */ }
      }

      // ── Advance step if running ────────────────────────────────────
      if (wf.run_status === 'running' && steps.length > 0 && currentStep < steps.length - 1) {
        const nextStep = currentStep + 1;

        // Check if current step conditions are met (simple: approval not pending)
        if (contextWindow.case.approvalState !== 'pending') {
          try {
            db.prepare('UPDATE workflow_runs SET current_step = ?, updated_at = ? WHERE id = ?')
              .run(nextStep, now, wf.run_id);
            actions.push({
              workflowId: wf.run_id,
              workflowName: wf.name,
              action: 'advance',
              detail: `Advanced to step ${nextStep + 1}/${steps.length}`,
            });
          } catch { /* non-critical */ }
        }
      }

      // ── Complete if at last step ───────────────────────────────────
      if (wf.run_status === 'running' && currentStep >= steps.length - 1 && steps.length > 0) {
        try {
          db.prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
            .run('completed', now, now, wf.run_id);
          actions.push({
            workflowId: wf.run_id,
            workflowName: wf.name,
            action: 'complete',
            detail: 'All steps completed',
          });
        } catch { /* non-critical */ }
      }
    }

    // ── Log actions ──────────────────────────────────────────────────────
    if (actions.length > 0) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          'workflow_runtime',
          `Workflow runtime: ${actions.length} action(s) on ${activeWorkflows.length} workflow(s)`,
          JSON.stringify({ actions, trigger: triggerEvent, agentRunId: runId }),
          now,
        );
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
