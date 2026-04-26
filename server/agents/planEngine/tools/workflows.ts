/**
 * server/agents/planEngine/tools/workflows.ts
 *
 * Workflow ToolSpecs for the unified Super Agent runtime.
 */

import { randomUUID } from 'crypto';
import { createWorkflowRepository } from '../../../data/index.js';
import { getDb } from '../../../db/client.js';
import { getDatabaseProvider } from '../../../db/provider.js';
import { getSupabaseAdmin } from '../../../db/supabase.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const workflowRepo = createWorkflowRepository();

function workflowScope(context: { tenantId: string; workspaceId: string | null }) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId ?? '',
  };
}

async function enrichWorkflow(workflow: any, tenantId: string) {
  if (!workflow) return workflow;
  const [versions, runs, metrics] = await Promise.all([
    workflowRepo.listVersions(workflow.id),
    workflowRepo.listRunsByWorkflow(workflow.id, tenantId),
    workflowRepo.getMetrics(workflow.id, tenantId),
  ]);
  const currentVersion = workflow.current_version_id
    ? await workflowRepo.getVersion(workflow.current_version_id)
    : await workflowRepo.getLatestVersion(workflow.id);

  return {
    ...workflow,
    current_version: currentVersion,
    versions,
    recent_runs: runs,
    metrics,
  };
}

export const workflowListTool: ToolSpec<{ status?: string; limit?: number }, unknown> = {
  name: 'workflow.list',
  version: '1.0.0',
  description: 'List workflow definitions with their current status and operational metrics.',
  category: 'workflow',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'workflows.read',
  args: s.object({
    status: s.string({ required: false, description: 'Optional workflow version status filter, for example draft or published' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of workflow definitions with metrics'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    const workflows = await workflowRepo.listDefinitions(scope.tenantId, scope.workspaceId);
    const filtered = args.status
      ? workflows.filter((workflow: any) => String(workflow.version_status || workflow.status || '').toLowerCase() === args.status!.toLowerCase())
      : workflows;
    const enriched = await Promise.all(
      filtered.slice(0, args.limit ?? 20).map(async (workflow: any) => ({
        ...workflow,
        metrics: await workflowRepo.getMetrics(workflow.id, scope.tenantId),
      })),
    );
    return { ok: true, value: enriched };
  },
};

export const workflowGetTool: ToolSpec<{ workflowId: string }, unknown> = {
  name: 'workflow.get',
  version: '1.0.0',
  description: 'Retrieve a single workflow with current version, versions, recent runs, and metrics.',
  category: 'workflow',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'workflows.read',
  args: s.object({
    workflowId: s.string({ description: 'UUID of the workflow definition to fetch' }),
  }),
  returns: s.any('Full workflow context or not found error'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    const workflow = await workflowRepo.getDefinition(args.workflowId, scope.tenantId, scope.workspaceId);
    if (!workflow) return { ok: false, error: 'Workflow not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: await enrichWorkflow(workflow, scope.tenantId) };
  },
};

export const workflowPublishTool: ToolSpec<{ workflowId: string; reason?: string }, unknown> = {
  name: 'workflow.publish',
  version: '1.0.0',
  description: 'Publish the current draft version of a workflow. This is a high-risk structural change and requires approval by policy.',
  category: 'workflow',
  sideEffect: 'write',
  risk: 'high',
  idempotent: false,
  requiredPermission: 'workflows.write',
  timeoutMs: 15_000,
  args: s.object({
    workflowId: s.string({ description: 'UUID of the workflow definition to publish' }),
    reason: s.string({ required: false, max: 500, description: 'Optional publication reason for the audit trail' }),
  }),
  returns: s.any('{ workflowId, versionId, status: "published" }'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    const workflow = await workflowRepo.getDefinition(args.workflowId, scope.tenantId, scope.workspaceId);
    if (!workflow) return { ok: false, error: 'Workflow not found', errorCode: 'NOT_FOUND' };

    const versions = await workflowRepo.listVersions(workflow.id);
    const draftVersion = versions.find((version: any) => String(version.status || '').toLowerCase() === 'draft');
    if (!draftVersion) {
      return { ok: false, error: 'No draft version available to publish', errorCode: 'NO_DRAFT_VERSION' };
    }

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          workflowId: workflow.id,
          versionId: draftVersion.id,
          status: 'published',
          dryRun: true,
        },
      };
    }

    const now = new Date().toISOString();
    if (workflow.current_version_id && workflow.current_version_id !== draftVersion.id) {
      await workflowRepo.updateVersion(workflow.current_version_id, { status: 'archived' });
    }

    await workflowRepo.updateVersion(draftVersion.id, {
      status: 'published',
      publishedBy: context.userId ?? 'system',
      publishedAt: now,
    });
    await workflowRepo.updateDefinition(workflow.id, scope.tenantId, scope.workspaceId, {
      currentVersionId: draftVersion.id,
    });

    await context.audit({
      action: 'PLAN_ENGINE_WORKFLOW_PUBLISHED',
      entityType: 'workflow',
      entityId: workflow.id,
      oldValue: { current_version_id: workflow.current_version_id || null },
      newValue: { current_version_id: draftVersion.id, reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        workflowId: workflow.id,
        versionId: draftVersion.id,
        status: 'published',
        publishedAt: now,
      },
    };
  },
};

// ── workflow.trigger ──────────────────────────────────────────────────────────

interface WorkflowTriggerArgs {
  workflowId: string;
  payload?: unknown;
}

export const workflowTriggerTool: ToolSpec<WorkflowTriggerArgs, unknown> = {
  name: 'workflow.trigger',
  version: '1.0.0',
  description:
    'Manually trigger a published workflow. Creates a queued run that will be picked up by the workflow engine. ' +
    'The workflow must have a published version. Returns the runId for tracking. ' +
    'Use payload to pass context data (e.g. caseId, customerId) to the workflow.',
  category: 'workflow',
  sideEffect: 'external',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'workflows.write',
  args: s.object({
    workflowId: s.string({ description: 'UUID of the workflow definition to trigger' }),
    payload: s.any('Optional context payload passed to the workflow (e.g. { caseId, customerId })'),
  }),
  returns: s.any('{ runId, workflowId, status: "queued" }'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    const workflow = await workflowRepo.getDefinition(args.workflowId, scope.tenantId, scope.workspaceId);
    if (!workflow) return { ok: false, error: 'Workflow not found', errorCode: 'NOT_FOUND' };
    if (!workflow.current_version_id) {
      return { ok: false, error: 'Workflow has no published version — publish a draft version first', errorCode: 'NOT_PUBLISHED' };
    }

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          runId: `dry_${randomUUID()}`,
          workflowId: args.workflowId,
          status: 'queued',
          dryRun: true,
        },
      };
    }

    const runId = randomUUID();
    const now   = new Date().toISOString();

    if (getDatabaseProvider() === 'supabase') {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('workflow_runs').insert({
        id: runId,
        workflow_version_id: workflow.current_version_id,
        tenant_id: scope.tenantId,
        trigger_type: 'manual.run',
        trigger_payload: args.payload ?? {},
        status: 'pending',
        context: { dryRun: false, source: 'plan-engine', planId: context.planId },
        started_at: now,
        ended_at: null,
        error: null,
      });
      if (error) throw error;
    } else {
      const db = getDb();
      db.prepare(`
        INSERT INTO workflow_runs
          (id, workflow_version_id, tenant_id, trigger_type, trigger_payload, status, context, started_at)
        VALUES (?, ?, ?, 'manual.run', ?, 'pending', ?, ?)
      `).run(
        runId,
        workflow.current_version_id,
        scope.tenantId,
        JSON.stringify(args.payload ?? {}),
        JSON.stringify({ dryRun: false, source: 'plan-engine', planId: context.planId }),
        now,
      );
    }

    await context.audit({
      action: 'PLAN_ENGINE_WORKFLOW_TRIGGERED',
      entityType: 'workflow',
      entityId: args.workflowId,
      newValue: { runId, trigger: 'manual.run', payload: args.payload ?? {} },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        runId,
        workflowId: args.workflowId,
        versionId: workflow.current_version_id,
        status: 'queued',
        triggeredAt: now,
      },
    };
  },
};
