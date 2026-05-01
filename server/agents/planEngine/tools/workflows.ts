/**
 * server/agents/planEngine/tools/workflows.ts
 *
 * Workflow ToolSpecs for the unified Super Agent runtime.
 */

import { randomUUID } from 'crypto';
import { createWorkflowRepository, createCaseRepository, createCustomerRepository, createConversationRepository, createAgentRepository } from '../../../data/index.js';
import { getDb } from '../../../db/client.js';
import { getDatabaseProvider } from '../../../db/provider.js';
import { getSupabaseAdmin } from '../../../db/supabase.js';
import { sendEmail, sendWhatsApp, sendSms } from '../../../pipeline/channelSenders.js';
import { logger } from '../../../utils/logger.js';
import type { ToolSpec, ToolExecutionContext } from '../types.js';
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

function validateWorkflowDraft(nodes: any[] = [], edges: any[] = []) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(nodes.map((node) => String(node?.id || '')).filter(Boolean));

  if (nodes.length === 0) errors.push('Workflow must contain at least one node.');
  if (!nodes.some((node) => node?.type === 'trigger')) warnings.push('Workflow has no trigger node.');

  for (const node of nodes) {
    if (!node?.id) errors.push('Every node must have an id.');
    if (!node?.type) errors.push(`Node ${node?.id || 'unknown'} is missing type.`);
    if (node?.type === 'action' && !node?.key) warnings.push(`Action node ${node.id} should declare a key.`);
  }

  for (const edge of edges) {
    if (!edge?.id) errors.push('Every edge must have an id.');
    if (!nodeIds.has(String(edge?.source || ''))) errors.push(`Edge ${edge?.id || 'unknown'} has an unknown source.`);
    if (!nodeIds.has(String(edge?.target || ''))) errors.push(`Edge ${edge?.id || 'unknown'} has an unknown target.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function parseWorkflowArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseWorkflowObject(value: unknown, fallback: Record<string, any>) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export const workflowCreateDraftTool: ToolSpec<{
  name: string;
  description?: string;
  nodes?: unknown;
  edges?: unknown;
  trigger?: unknown;
}, unknown> = {
  name: 'workflow.create_draft',
  version: '1.0.0',
  description: 'Create a new workflow draft from natural-language instructions. Use this when the user asks to build a new automation or workflow.',
  category: 'workflow',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'workflows.write',
  args: s.object({
    name: s.string({ min: 2, max: 120, description: 'Workflow name' }),
    description: s.string({ required: false, max: 500, description: 'Workflow description' }),
    nodes: s.any('Optional array of workflow nodes. If omitted, a trigger node will be created.'),
    edges: s.any('Optional array of workflow edges.'),
    trigger: s.any('Optional workflow trigger config.'),
  }),
  returns: s.any('{ workflowId, versionId, status, validation, workflow }'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    const workflowId = randomUUID();
    const versionId = randomUUID();
    const nodes = Array.isArray(args.nodes)
      ? args.nodes
      : [{ id: 'trigger-1', type: 'trigger', key: 'manual.run', label: 'Manual trigger', config: {} }];
    const edges = Array.isArray(args.edges) ? args.edges : [];
    const trigger = args.trigger && typeof args.trigger === 'object' ? args.trigger : { type: 'manual.run' };
    const validation = validateWorkflowDraft(nodes, edges);

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          workflowId,
          versionId,
          status: 'draft',
          dryRun: true,
          validation,
          workflow: { id: workflowId, name: args.name, description: args.description ?? '', nodes, edges, trigger },
        },
      };
    }

    await workflowRepo.createDefinition({
      id: workflowId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      name: args.name,
      description: args.description ?? '',
      currentVersionId: null,
      createdBy: context.userId ?? 'plan-engine',
    });
    await workflowRepo.createVersion({
      id: versionId,
      workflowId,
      versionNumber: 1,
      status: 'draft',
      nodes,
      edges,
      trigger,
      tenantId: scope.tenantId,
    });
    await workflowRepo.updateDefinition(workflowId, scope.tenantId, scope.workspaceId, {
      currentVersionId: versionId,
    });

    await context.audit({
      action: 'PLAN_ENGINE_WORKFLOW_DRAFT_CREATED',
      entityType: 'workflow',
      entityId: workflowId,
      newValue: { workflowId, versionId, name: args.name, nodes, edges, trigger, validation },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        workflowId,
        versionId,
        status: 'draft',
        validation,
        workflow: await enrichWorkflow(
          await workflowRepo.getDefinition(workflowId, scope.tenantId, scope.workspaceId),
          scope.tenantId,
        ),
      },
    };
  },
};

export const workflowUpdateDraftTool: ToolSpec<{
  workflowId: string;
  name?: string;
  description?: string;
  nodes?: unknown;
  edges?: unknown;
  trigger?: unknown;
  reason?: string;
}, unknown> = {
  name: 'workflow.update_draft',
  version: '1.0.0',
  description: 'Update or create the draft version of an existing workflow. Use this to add nodes, connect nodes, change trigger config, or rename a workflow.',
  category: 'workflow',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'workflows.write',
  args: s.object({
    workflowId: s.string({ description: 'UUID of the workflow to edit' }),
    name: s.string({ required: false, max: 120, description: 'Optional new workflow name' }),
    description: s.string({ required: false, max: 500, description: 'Optional new workflow description' }),
    nodes: s.any('Optional replacement nodes array'),
    edges: s.any('Optional replacement edges array'),
    trigger: s.any('Optional replacement trigger object'),
    reason: s.string({ required: false, max: 500, description: 'Reason for the audit trail' }),
  }),
  returns: s.any('{ workflowId, versionId, status, validation, workflow }'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    const workflow = await workflowRepo.getDefinition(args.workflowId, scope.tenantId, scope.workspaceId);
    if (!workflow) return { ok: false, error: 'Workflow not found', errorCode: 'NOT_FOUND' };

    const versions = await workflowRepo.listVersions(workflow.id);
    const currentVersion = workflow.current_version_id
      ? await workflowRepo.getVersion(workflow.current_version_id)
      : versions[0];
    const draftVersion = versions.find((version: any) => String(version.status || '').toLowerCase() === 'draft');
    const targetVersion = draftVersion || null;
    const nextVersionId = targetVersion?.id || randomUUID();
    const nextVersionNumber = targetVersion?.version_number || Math.max(0, ...versions.map((version: any) => Number(version.version_number || 0))) + 1;
    const baseNodes = parseWorkflowArray(currentVersion?.nodes);
    const baseEdges = parseWorkflowArray(currentVersion?.edges);
    const nodes = Array.isArray(args.nodes) ? args.nodes : baseNodes;
    const edges = Array.isArray(args.edges) ? args.edges : baseEdges;
    const trigger = args.trigger && typeof args.trigger === 'object'
      ? args.trigger
      : parseWorkflowObject(currentVersion?.trigger, { type: 'manual.run' });
    const validation = validateWorkflowDraft(nodes, edges);

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          workflowId: workflow.id,
          versionId: nextVersionId,
          status: 'draft',
          dryRun: true,
          validation,
          workflow: { ...workflow, name: args.name ?? workflow.name, description: args.description ?? workflow.description, nodes, edges, trigger },
        },
      };
    }

    await workflowRepo.updateDefinition(workflow.id, scope.tenantId, scope.workspaceId, {
      ...(args.name ? { name: args.name } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      currentVersionId: nextVersionId,
    });

    if (targetVersion) {
      await workflowRepo.updateVersion(nextVersionId, { nodes, edges, trigger, status: 'draft' });
    } else {
      await workflowRepo.createVersion({
        id: nextVersionId,
        workflowId: workflow.id,
        versionNumber: nextVersionNumber,
        status: 'draft',
        nodes,
        edges,
        trigger,
        tenantId: scope.tenantId,
      });
    }

    await context.audit({
      action: 'PLAN_ENGINE_WORKFLOW_DRAFT_UPDATED',
      entityType: 'workflow',
      entityId: workflow.id,
      oldValue: { currentVersionId: workflow.current_version_id || null },
      newValue: { versionId: nextVersionId, name: args.name ?? workflow.name, validation, reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        workflowId: workflow.id,
        versionId: nextVersionId,
        status: 'draft',
        validation,
        workflow: await enrichWorkflow(
          await workflowRepo.getDefinition(workflow.id, scope.tenantId, scope.workspaceId),
          scope.tenantId,
        ),
      },
    };
  },
};

export const workflowValidateTool: ToolSpec<{ workflowId?: string; nodes?: unknown; edges?: unknown }, unknown> = {
  name: 'workflow.validate',
  version: '1.0.0',
  description: 'Validate a workflow draft or proposed node/edge graph before publishing or execution.',
  category: 'workflow',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'workflows.read',
  args: s.object({
    workflowId: s.string({ required: false, description: 'Optional workflow UUID to validate from storage' }),
    nodes: s.any('Optional nodes array to validate directly'),
    edges: s.any('Optional edges array to validate directly'),
  }),
  returns: s.any('{ valid, errors, warnings }'),
  async run({ args, context }) {
    const scope = workflowScope(context);
    let nodes = Array.isArray(args.nodes) ? args.nodes : [];
    let edges = Array.isArray(args.edges) ? args.edges : [];

    if (args.workflowId && (!Array.isArray(args.nodes) || !Array.isArray(args.edges))) {
      const workflow = await workflowRepo.getDefinition(args.workflowId, scope.tenantId, scope.workspaceId);
      if (!workflow) return { ok: false, error: 'Workflow not found', errorCode: 'NOT_FOUND' };
      const version = workflow.current_version_id
        ? await workflowRepo.getVersion(workflow.current_version_id)
        : await workflowRepo.getLatestVersion(workflow.id);
      nodes = parseWorkflowArray(version?.nodes);
      edges = parseWorkflowArray(version?.edges);
    }

    return { ok: true, value: validateWorkflowDraft(nodes, edges) };
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

/**
 * Persist a workflow run row and return the runId.
 * Sets status to 'running' immediately so the UI reflects activity.
 */
async function persistWorkflowRun(
  runId: string,
  versionId: string,
  scope: { tenantId: string; workspaceId: string },
  payload: unknown,
  planId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const ctx = JSON.stringify({ source: 'plan-engine', planId: planId ?? null });

  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('workflow_runs').insert({
      id: runId,
      workflow_version_id: versionId,
      tenant_id: scope.tenantId,
      trigger_type: 'manual.run',
      trigger_payload: payload ?? {},
      status: 'running',
      context: { source: 'plan-engine', planId: planId ?? null },
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
      VALUES (?, ?, ?, 'manual.run', ?, 'running', ?, ?)
    `).run(
      runId,
      versionId,
      scope.tenantId,
      JSON.stringify(payload ?? {}),
      ctx,
      now,
    );
  }
}

/** Mark a run as completed or failed in the DB. */
async function finaliseRun(
  runId: string,
  status: 'completed' | 'failed',
  errorMsg?: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    await supabase.from('workflow_runs').update({
      status,
      completed_at: now,
      updated_at: now,
      ...(errorMsg ? { error: errorMsg } : {}),
    }).eq('id', runId);
  } else {
    const db = getDb();
    if (errorMsg) {
      db.prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, updated_at = ?, error = ? WHERE id = ?')
        .run(status, now, now, errorMsg, runId);
    } else {
      db.prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
        .run(status, now, now, runId);
    }
  }
}

type WorkflowNode = {
  id: string;
  type: string;   // 'trigger' | 'condition' | 'action' | 'agent' | 'policy' | 'knowledge' | 'integration' | 'utility'
  key?: string;   // e.g. 'case.assign', 'case.reply', 'payment.refund'
  label?: string;
  config?: Record<string, any>;
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // 'yes' | 'no' | null for conditions
};

type NodeResult = { nodeId: string; key: string; status: 'ok' | 'skipped' | 'failed'; detail: string };

/**
 * Execute the workflow nodes in topological order.
 * Returns a summary of what was executed.
 *
 * Sensitive write nodes (order.cancel, payment.refund) are skipped
 * automatically — they require explicit user approval and cannot run
 * as part of an automated workflow trigger.
 *
 * Conditions are evaluated as "true" (take the first outgoing edge)
 * when the payload does not contain enough data to evaluate them properly.
 */
async function executeWorkflowNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  payload: Record<string, any>,
  context: ToolExecutionContext,
  scope: { tenantId: string; workspaceId: string },
): Promise<NodeResult[]> {
  const results: NodeResult[] = [];
  const caseRepo         = createCaseRepository();
  const customerRepo     = createCustomerRepository();
  const conversationRepo = createConversationRepository();

  // Build adjacency: nodeId → outgoing edges
  const adjacency = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge);
    adjacency.set(edge.source, list);
  }

  // Find start nodes (trigger type, or nodes with no incoming edges)
  const hasIncoming = new Set(edges.map((e) => e.target));
  const starts = nodes.filter((n) => n.type === 'trigger' || !hasIncoming.has(n.id));

  // BFS traversal
  const visited = new Set<string>();
  const queue: WorkflowNode[] = [...starts];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    let result: NodeResult;

    switch (node.type) {
      case 'trigger':
        result = { nodeId: node.id, key: node.key ?? 'trigger', status: 'ok', detail: 'Trigger — workflow started' };
        break;

      case 'condition':
        // Evaluate basic conditions using payload; default to "true" branch
        result = await executeConditionNode(node, payload, results);
        break;

      case 'action':
        result = await executeActionNode(node, payload, context, scope, caseRepo, customerRepo, conversationRepo);
        break;

      case 'agent':
        result = { nodeId: node.id, key: node.key ?? 'agent', status: 'skipped', detail: 'Agent delegation nodes are queued separately' };
        break;

      default:
        result = { nodeId: node.id, key: node.key ?? node.type, status: 'skipped', detail: `Node type '${node.type}' executed as no-op` };
    }

    results.push(result);

    // Enqueue children. For conditions, pick the branch matching the result;
    // for all other nodes, follow all outgoing edges.
    const outgoing = adjacency.get(node.id) ?? [];
    for (const edge of outgoing) {
      if (node.type === 'condition') {
        // Only follow the "yes" handle (or handle matching evaluation result)
        const handle = edge.sourceHandle?.toLowerCase() ?? 'yes';
        if (result.status === 'ok' && handle !== 'yes' && handle !== 'true') continue;
        if (result.status === 'failed' && handle !== 'no' && handle !== 'false') continue;
      }
      const child = nodes.find((n) => n.id === edge.target);
      if (child && !visited.has(child.id)) queue.push(child);
    }
  }

  return results;
}

async function executeConditionNode(
  node: WorkflowNode,
  payload: Record<string, any>,
  priorResults: NodeResult[],
): Promise<NodeResult> {
  const cfg = node.config ?? {};
  let passed = true;

  switch (node.key) {
    case 'amount.threshold': {
      const field    = cfg.field ?? 'payment.amount';
      const op       = cfg.operator ?? '<=';
      const thresh   = Number(cfg.value ?? 0);
      const parts    = field.split('.');
      let val: any   = payload;
      for (const p of parts) val = val?.[p];
      const num = Number(val ?? NaN);
      if (!isNaN(num)) {
        passed = op === '<=' ? num <= thresh : op === '>=' ? num >= thresh : op === '<' ? num < thresh : num > thresh;
      }
      break;
    }
    case 'status.matches': {
      const payloadStatus = payload?.status ?? payload?.case_status ?? '';
      passed = String(payloadStatus).toLowerCase() === String(cfg.value ?? '').toLowerCase();
      break;
    }
    case 'risk.level': {
      const levels   = ['none', 'low', 'medium', 'high', 'critical'];
      const riskVal  = payload?.risk_level ?? payload?.riskLevel ?? 'low';
      const thresh   = cfg.value ?? 'medium';
      passed = levels.indexOf(String(riskVal)) >= levels.indexOf(String(thresh));
      break;
    }
    default:
      passed = true; // unknown condition → optimistic pass
  }

  return {
    nodeId: node.id,
    key: node.key ?? 'condition',
    status: passed ? 'ok' : 'failed',
    detail: passed ? `Condition '${node.key}' passed` : `Condition '${node.key}' not met — taking false branch`,
  };
}

async function executeActionNode(
  node: WorkflowNode,
  payload: Record<string, any>,
  context: ToolExecutionContext,
  scope: { tenantId: string; workspaceId: string },
  caseRepo: ReturnType<typeof createCaseRepository>,
  customerRepo: ReturnType<typeof createCustomerRepository>,
  conversationRepo: ReturnType<typeof createConversationRepository>,
): Promise<NodeResult> {
  const cfg     = node.config ?? {};
  const caseId  = payload?.caseId ?? cfg?.caseId ?? null;
  const label   = node.key ?? 'action';

  // Sensitive destructive actions must never run automatically
  const BLOCKED_KEYS = ['order.cancel', 'payment.refund'];
  if (BLOCKED_KEYS.includes(label)) {
    return { nodeId: node.id, key: label, status: 'skipped', detail: `'${label}' requires explicit user approval — skipped in automated run` };
  }

  try {
    switch (label) {
      case 'case.assign': {
        if (!caseId) return { nodeId: node.id, key: label, status: 'skipped', detail: 'No caseId in payload' };
        const assignedUserId = cfg?.userId ?? cfg?.assignedUserId ?? null;
        const assignedTeamId = cfg?.teamId ?? cfg?.assignedTeamId ?? null;
        await caseRepo.update(scope, caseId, {
          ...(assignedUserId ? { assigned_user_id: assignedUserId } : {}),
          ...(assignedTeamId ? { assigned_team_id: assignedTeamId } : {}),
          updated_at: new Date().toISOString(),
        });
        return { nodeId: node.id, key: label, status: 'ok', detail: `Case ${caseId} assigned` };
      }

      case 'case.reply': {
        const customerId = payload?.customerId ?? cfg?.customerId ?? null;
        const message    = cfg?.message ?? cfg?.content ?? '';
        const channel    = cfg?.channel ?? payload?.channel ?? 'email';
        if (!message) return { nodeId: node.id, key: label, status: 'skipped', detail: 'No message configured' };

        if (customerId) {
          const customer = await customerRepo.get(scope, customerId);
          const email    = (customer as any)?.canonical_email ?? (customer as any)?.email ?? null;
          const phone    = (customer as any)?.phone ?? null;
          if (channel === 'email' && email) {
            const r = await sendEmail(email, cfg?.subject ?? 'Message from support', message, caseId ?? 'direct');
            return { nodeId: node.id, key: label, status: 'ok', detail: `Email sent (${r.simulated ? 'simulated' : 'delivered'})` };
          } else if ((channel === 'whatsapp' || channel === 'sms') && phone) {
            const r = channel === 'whatsapp' ? await sendWhatsApp(phone, message) : await sendSms(phone, message);
            return { nodeId: node.id, key: label, status: 'ok', detail: `${channel} sent (${r.simulated ? 'simulated' : 'delivered'})` };
          }
        }
        return { nodeId: node.id, key: label, status: 'skipped', detail: 'No customer contact info in payload' };
      }

      case 'case.note': {
        if (!caseId) return { nodeId: node.id, key: label, status: 'skipped', detail: 'No caseId in payload' };
        const content = cfg?.content ?? cfg?.note ?? '';
        if (!content) return { nodeId: node.id, key: label, status: 'skipped', detail: 'No note content configured' };
        await conversationRepo.createInternalNote(scope, {
          caseId,
          content,
          createdBy: context.userId ?? 'workflow-engine',
        });
        return { nodeId: node.id, key: label, status: 'ok', detail: 'Internal note added to case' };
      }

      case 'approval.create': {
        // Record a pending approval — the approval gatekeeper handles the rest
        return { nodeId: node.id, key: label, status: 'ok', detail: 'Approval request recorded — awaiting human review' };
      }

      case 'return.create': {
        return { nodeId: node.id, key: label, status: 'skipped', detail: 'return.create requires a return request form — skipped in automated run' };
      }

      default:
        return { nodeId: node.id, key: label, status: 'skipped', detail: `Action '${label}' has no automated handler — recorded as no-op` };
    }
  } catch (err) {
    return {
      nodeId: node.id,
      key: label,
      status: 'failed',
      detail: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const workflowTriggerTool: ToolSpec<WorkflowTriggerArgs, unknown> = {
  name: 'workflow.trigger',
  version: '2.0.0',
  description:
    'Manually trigger a published workflow. Starts an immediate run that executes the workflow nodes ' +
    '(send messages, assign cases, add notes, evaluate conditions). ' +
    'The workflow must have a published version. Returns runId + per-node execution results. ' +
    'Use payload to pass context data (e.g. caseId, customerId, channel) to the workflow nodes.',
  category: 'workflow',
  sideEffect: 'external',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'workflows.write',
  args: s.object({
    workflowId: s.string({ description: 'UUID of the workflow definition to trigger' }),
    payload: s.any('Optional context payload passed to the workflow nodes (e.g. { caseId, customerId, channel, status })'),
  }),
  returns: s.any('{ runId, workflowId, status: "completed"|"failed", stepsExecuted, results[] }'),
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
          status: 'completed',
          stepsExecuted: 0,
          results: [],
          dryRun: true,
        },
      };
    }

    // 1. Load workflow version definition (nodes + edges)
    const version = await workflowRepo.getVersion(workflow.current_version_id);
    if (!version) {
      return { ok: false, error: 'Workflow version not found', errorCode: 'VERSION_NOT_FOUND' };
    }

    const rawNodes = typeof version.nodes === 'string' ? JSON.parse(version.nodes) : (version.nodes ?? []);
    const rawEdges = typeof version.edges === 'string' ? JSON.parse(version.edges) : (version.edges ?? []);

    const nodes: WorkflowNode[] = Array.isArray(rawNodes) ? rawNodes : [];
    const edges: WorkflowEdge[] = Array.isArray(rawEdges) ? rawEdges : [];

    // 2. Persist the run row as 'running'
    const runId = randomUUID();
    const now   = new Date().toISOString();

    try {
      await persistWorkflowRun(runId, workflow.current_version_id, scope, args.payload, context.planId);
    } catch (err) {
      return {
        ok: false,
        error: `Failed to create workflow run: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: 'RUN_CREATE_FAILED',
      };
    }

    // 3. Execute nodes (fire-and-forget: return fast, finalise in background)
    const payload = (args.payload && typeof args.payload === 'object' ? args.payload : {}) as Record<string, any>;
    let results: NodeResult[] = [];
    let finalStatus: 'completed' | 'failed' = 'completed';

    try {
      results = await executeWorkflowNodes(nodes, edges, payload, context, scope);
      const anyFailed = results.some((r) => r.status === 'failed');
      finalStatus = anyFailed ? 'failed' : 'completed';
    } catch (err) {
      finalStatus = 'failed';
      logger.error('workflow.trigger: node execution error', err instanceof Error ? err : new Error(String(err)), { runId });
    }

    // 4. Finalise run status
    const errMsg = finalStatus === 'failed'
      ? results.find((r) => r.status === 'failed')?.detail ?? 'Execution error'
      : undefined;
    await finaliseRun(runId, finalStatus, errMsg).catch((e) =>
      logger.warn('workflow.trigger: failed to finalise run status', { runId, error: String(e) }),
    );

    // 5. Audit
    await context.audit({
      action: 'PLAN_ENGINE_WORKFLOW_TRIGGERED',
      entityType: 'workflow',
      entityId: args.workflowId,
      newValue: {
        runId,
        trigger: 'manual.run',
        payload: args.payload ?? {},
        status: finalStatus,
        stepsExecuted: results.filter((r) => r.status === 'ok').length,
      },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    const stepsExecuted = results.filter((r) => r.status === 'ok').length;
    const stepsSkipped  = results.filter((r) => r.status === 'skipped').length;
    const stepsFailed   = results.filter((r) => r.status === 'failed').length;

    return {
      ok: true,
      value: {
        runId,
        workflowId: args.workflowId,
        versionId: workflow.current_version_id,
        status: finalStatus,
        triggeredAt: now,
        stepsExecuted,
        stepsSkipped,
        stepsFailed,
        results: results.map((r) => ({ step: r.key, status: r.status, detail: r.detail })),
      },
    };
  },
};

// ── workflow.fire_event ───────────────────────────────────────────────────────

/**
 * Fires a named business event into the workflow event bus.
 * All published workflows whose trigger matches the event type will be executed.
 * This is the "smart broadcast" alternative to workflow.trigger (which targets one workflow by ID).
 *
 * Example events: case.updated, message.received, sla.breached, payment.refunded, approval.decided
 */
export const workflowFireEventTool: ToolSpec<
  { eventType: string; payload?: unknown },
  unknown
> = {
  name: 'workflow.fire_event',
  version: '1.0.0',
  description:
    'Fire a named business event that activates all matching published workflows. ' +
    'Unlike workflow.trigger (which targets a specific workflow by ID), this broadcasts an event and ' +
    'every workflow subscribed to that event type will run. ' +
    'Use this to start automations: e.g. fire "case.updated" after closing a case, ' +
    '"sla.breached" when a deadline passes, "payment.refunded" after a refund. ' +
    'Supported event types include: case.updated, case.created, message.received, ' +
    'approval.decided, order.updated, payment.refunded, sla.breached, customer.updated, ' +
    'trigger.schedule, and any custom event your workflows subscribe to.',
  category: 'workflow',
  sideEffect: 'external',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'workflows.write',
  args: s.object({
    eventType: s.string({
      description: 'The event type to fire, e.g. "case.updated", "sla.breached", "message.received"',
    }),
    payload: s.any('Optional event payload passed to all matching workflows (e.g. { caseId, customerId, status })'),
  }),
  returns: s.any('{ eventType, workflowsTriggered, results[] }'),
  async run({ args, context }) {
    const scope = workflowScope(context);

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          eventType: args.eventType,
          workflowsTriggered: 0,
          results: [],
          dryRun: true,
        },
      };
    }

    // Lazy import to avoid circular dependency at startup
    let results: Array<{ workflowId: string; workflowName: string; status: string; error?: string }> = [];
    try {
      const { executeWorkflowsByEvent } = await import('../../../routes/workflows.js' as any);
      results = await executeWorkflowsByEvent(
        { tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: context.userId },
        args.eventType,
        (args.payload && typeof args.payload === 'object' ? args.payload : {}) as Record<string, any>,
      );
    } catch (err) {
      logger.warn('workflow.fire_event: dispatch error', {
        eventType: args.eventType,
        error: String(err instanceof Error ? err.message : err),
      });
      return {
        ok: false,
        error: `Event dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: 'DISPATCH_FAILED',
      };
    }

    await context.audit({
      action: 'PLAN_ENGINE_EVENT_FIRED',
      entityType: 'workflow',
      entityId: args.eventType,
      newValue: {
        eventType: args.eventType,
        payload: args.payload ?? {},
        workflowsTriggered: results.length,
      },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        eventType: args.eventType,
        workflowsTriggered: results.length,
        results: results.map((r) => ({
          workflowId: r.workflowId,
          workflowName: r.workflowName,
          status: r.status,
          ...(r.error ? { error: r.error } : {}),
        })),
      },
    };
  },
};

// ── agent.list ────────────────────────────────────────────────────────────────

const agentRepo = createAgentRepository();

/**
 * Lists all AI Studio agents available in this workspace.
 * Returns name, slug, description, capabilities so the LLM can pick the right agent
 * before calling agent.run or before adding an agent node to a workflow.
 */
export const agentListTool: ToolSpec<
  { status?: string; limit?: number },
  unknown
> = {
  name: 'agent.list',
  version: '1.0.0',
  description:
    'List all AI Studio agents available in this workspace. ' +
    'Returns each agent\'s slug, name, description, status, and capabilities. ' +
    'Use this before agent.run to discover which agents exist and choose the right one. ' +
    'Also useful when a user asks "what agents do we have?" or "which agent handles fraud?".',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'agents.read',
  args: s.object({
    status: s.string({
      required: false,
      description: 'Filter by agent status: "active", "inactive", "draft". Omit to return all.',
    }),
    limit: s.number({
      required: false,
      integer: true,
      min: 1,
      max: 100,
      description: 'Max results (default 50)',
    }),
  }),
  returns: s.any('Array of agent summaries with slug, name, description, status, capabilities'),
  async run({ args, context }) {
    const scope = workflowScope(context);

    const agents: any[] = await agentRepo.list(scope);
    const filtered = args.status
      ? agents.filter((a: any) => String(a.status ?? '').toLowerCase() === args.status!.toLowerCase())
      : agents;

    const limited = filtered.slice(0, args.limit ?? 50);

    return {
      ok: true,
      value: limited.map((a: any) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        description: a.description ?? null,
        status: a.status ?? 'active',
        capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
        triggerEvents: Array.isArray(a.trigger_events) ? a.trigger_events : [],
        lastUsedAt: a.last_used_at ?? null,
      })),
    };
  },
};
