import { Router } from 'express';
import crypto from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import {
  createApprovalRepository,
  createAuditRepository,
  createCaseRepository,
  createCommerceRepository,
  createConversationRepository,
  createIntegrationRepository,
  createKnowledgeRepository,
  createWorkflowRepository,
} from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { runAgent } from '../agents/runner.js';

const router = Router();
const workflowRepository = createWorkflowRepository();
const auditRepository = createAuditRepository();
const caseRepository = createCaseRepository();
const commerceRepository = createCommerceRepository();
const conversationRepository = createConversationRepository();
const approvalRepository = createApprovalRepository();
const knowledgeRepository = createKnowledgeRepository();
const integrationRepository = createIntegrationRepository();

router.use(extractMultiTenant);

const NODE_CATALOG = [
  { type: 'trigger', key: 'case.created', label: 'Case created', category: 'Trigger', icon: 'assignment', requiresConfig: false },
  { type: 'trigger', key: 'message.received', label: 'Message received', category: 'Trigger', icon: 'mail', requiresConfig: false },
  { type: 'trigger', key: 'order.updated', label: 'Order updated', category: 'Trigger', icon: 'shopping_bag', requiresConfig: false },
  { type: 'trigger', key: 'payment.failed', label: 'Payment failed', category: 'Trigger', icon: 'payments', requiresConfig: false },
  { type: 'trigger', key: 'return.created', label: 'Return created', category: 'Trigger', icon: 'keyboard_return', requiresConfig: false },
  { type: 'trigger', key: 'approval.decided', label: 'Approval decided', category: 'Trigger', icon: 'task_alt', requiresConfig: false },
  { type: 'trigger', key: 'webhook.received', label: 'Webhook received', category: 'Trigger', icon: 'webhook', requiresConfig: true },
  { type: 'trigger', key: 'manual.run', label: 'Manual run', category: 'Trigger', icon: 'play_arrow', requiresConfig: false },
  { type: 'condition', key: 'amount.threshold', label: 'Amount threshold', category: 'Condition', icon: 'attach_money', requiresConfig: true },
  { type: 'condition', key: 'status.matches', label: 'Status matches', category: 'Condition', icon: 'rule', requiresConfig: true },
  { type: 'condition', key: 'risk.level', label: 'Risk level', category: 'Condition', icon: 'gpp_maybe', requiresConfig: true },
  { type: 'condition', key: 'conflict.exists', label: 'Conflict exists', category: 'Condition', icon: 'sync_problem', requiresConfig: false },
  { type: 'action', key: 'case.assign', label: 'Assign case', category: 'Action', icon: 'person_add', requiresConfig: true },
  { type: 'action', key: 'case.reply', label: 'Send reply', category: 'Action', icon: 'reply', requiresConfig: true },
  { type: 'action', key: 'case.note', label: 'Create internal note', category: 'Action', icon: 'note_add', requiresConfig: true },
  { type: 'action', key: 'order.cancel', label: 'Cancel order', category: 'Action', icon: 'block', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'payment.refund', label: 'Issue refund', category: 'Action', icon: 'currency_exchange', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'return.create', label: 'Create return', category: 'Action', icon: 'assignment_return', requiresConfig: true },
  { type: 'action', key: 'approval.create', label: 'Request approval', category: 'Action', icon: 'verified', requiresConfig: true },
  { type: 'agent', key: 'agent.run', label: 'Run specialist agent', category: 'Agent', icon: 'smart_toy', requiresConfig: true },
  { type: 'policy', key: 'policy.evaluate', label: 'Evaluate policy', category: 'Policy', icon: 'shield', requiresConfig: true },
  { type: 'knowledge', key: 'knowledge.search', label: 'Search knowledge', category: 'Knowledge', icon: 'menu_book', requiresConfig: true },
  { type: 'integration', key: 'connector.call', label: 'Call connector', category: 'Integration', icon: 'hub', requiresConfig: true },
  { type: 'utility', key: 'delay', label: 'Delay', category: 'Utility', icon: 'schedule', requiresConfig: true },
  { type: 'utility', key: 'retry', label: 'Retry', category: 'Utility', icon: 'refresh', requiresConfig: true },
  { type: 'utility', key: 'stop', label: 'Stop workflow', category: 'Utility', icon: 'stop_circle', requiresConfig: false },
];

const SENSITIVE_KEYS = new Set(['order.cancel', 'payment.refund', 'connector.call']);
const PAUSED_STATUSES = new Set(['waiting', 'waiting_approval', 'paused']);

function parseMaybeJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMaybeJsonObject(value: any): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeNodeType(type: any, key?: any) {
  const raw = String(type ?? key ?? '').toLowerCase();
  if (raw === 'decision') return 'condition';
  if (raw === 'approval' || raw === 'human_review') return 'action';
  if (raw === 'task') return String(key ?? '').includes('agent') ? 'agent' : 'action';
  if (['trigger', 'condition', 'action', 'agent', 'policy', 'knowledge', 'integration', 'utility'].includes(raw)) return raw;
  return 'action';
}

function normalizeNodeKey(node: any, type: string) {
  if (node.key) return node.key;
  if (node.action) return node.action;
  if (node.type === 'approval') return 'approval.create';
  if (node.type === 'decision') return 'status.matches';
  if (type === 'trigger') return 'manual.run';
  if (type === 'policy') return 'policy.evaluate';
  if (type === 'knowledge') return 'knowledge.search';
  if (type === 'integration') return 'connector.call';
  if (type === 'agent') return 'agent.run';
  return 'case.note';
}

function normalizeEdges(edges: any[] | string = []) {
  return parseMaybeJsonArray(edges).map((edge, index) => {
    const source = edge.source ?? edge.from;
    const target = edge.target ?? edge.to;
    const label = edge.label ?? edge.condition ?? edge.sourceHandle ?? 'next';
    return {
      id: edge.id ?? `edge_${source}_${target}_${index}`,
      source,
      target,
      label,
      sourceHandle: edge.sourceHandle ?? edge.source_handle ?? (label === 'true' || label === 'false' ? label : 'main'),
      targetHandle: edge.targetHandle ?? edge.target_handle ?? null,
    };
  }).filter((edge) => edge.source && edge.target);
}

function normalizeNodes(nodes: any[] | string = []) {
  return parseMaybeJsonArray(nodes).map((node, index) => {
    const type = normalizeNodeType(node.type, node.key);
    const key = normalizeNodeKey(node, type);
    const config = parseMaybeJsonObject(node.config);
    return {
    id: node.id ?? `node_${index + 1}`,
    type,
    key,
    label: node.label ?? node.name ?? node.key ?? 'Untitled node',
    position: node.position ?? { x: 160 + index * 240, y: 160 + (index % 3) * 100 },
    config,
    disabled: Boolean(node.disabled),
    ui: node.ui ?? {},
    credentialsRef: node.credentialsRef ?? node.credentials_ref ?? config.connector_id ?? config.connectorId ?? config.connector ?? null,
    retryPolicy: node.retryPolicy ?? node.retry_policy ?? null,
  };
  });
}

function buildDiagnostic(nodeId: string | null, severity: 'error' | 'warning' | 'info', code: string, message: string, blocking = severity === 'error') {
  return { nodeId, severity, code, message, blocking };
}

function validateWorkflowDefinition(nodes: any[] = [], edges: any[] = []) {
  const normalized = normalizeNodes(nodes);
  const normalizedEdges = normalizeEdges(edges);
  const errors: string[] = [];
  const warnings: string[] = [];
  const diagnostics: any[] = [];
  const catalogByKey = new Map(NODE_CATALOG.map((node) => [node.key, node]));

  if (normalized.length === 0) {
    const diagnostic = buildDiagnostic(null, 'error', 'workflow.empty', 'Add at least one trigger node.');
    errors.push(diagnostic.message);
    diagnostics.push(diagnostic);
  }
  if (!normalized.some((node) => node.type === 'trigger')) {
    const diagnostic = buildDiagnostic(null, 'error', 'workflow.missing_trigger', 'A workflow needs one trigger.');
    errors.push(diagnostic.message);
    diagnostics.push(diagnostic);
  }

  const nodeIds = new Set(normalized.map((node) => node.id));
  for (const edge of normalizedEdges) {
    if (!nodeIds.has(edge.source)) {
      const diagnostic = buildDiagnostic(edge.source ?? null, 'error', 'edge.unknown_source', `Edge ${edge.id ?? ''} has an unknown source.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (!nodeIds.has(edge.target)) {
      const diagnostic = buildDiagnostic(edge.target ?? null, 'error', 'edge.unknown_target', `Edge ${edge.id ?? ''} has an unknown target.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
  }

  for (const node of normalized) {
    const spec = catalogByKey.get(node.key);
    if (node.disabled) {
      diagnostics.push(buildDiagnostic(node.id, 'info', 'node.disabled', `${node.label} is disabled and will be skipped.`, false));
      continue;
    }
    if (!spec) {
      const diagnostic = buildDiagnostic(node.id, 'warning', 'node.custom_key', `${node.label} uses a custom node key (${node.key}).`, false);
      warnings.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (spec?.requiresConfig && Object.keys(node.config ?? {}).length === 0) {
      const diagnostic = buildDiagnostic(node.id, 'error', 'node.missing_config', `${node.label} needs configuration before publishing.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (node.key === 'connector.call' && !(node.credentialsRef || node.config?.connector_id || node.config?.connectorId || node.config?.connector)) {
      const diagnostic = buildDiagnostic(node.id, 'error', 'connector.missing_connection', `${node.label} needs a connector connection before publishing.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (node.key === 'delay' && !(node.config?.duration || node.config?.until || node.config?.mode === 'manual_resume')) {
      diagnostics.push(buildDiagnostic(node.id, 'warning', 'delay.manual_resume', `${node.label} has no duration and will wait for manual resume.`, false));
    }
    if (SENSITIVE_KEYS.has(node.key) && !node.retryPolicy) {
      diagnostics.push(buildDiagnostic(node.id, 'warning', 'runtime.retry_missing', `${node.label} has no retry policy configured.`, false));
    }
    if (spec?.sensitive && !normalized.some((candidate) => !candidate.disabled && (candidate.type === 'policy' || candidate.key === 'policy.evaluate' || candidate.key === 'approval.create'))) {
      const diagnostic = buildDiagnostic(node.id, 'error', 'sensitive.missing_guardrail', `${node.label} is sensitive and requires a policy or approval node.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    diagnostics,
    nodes: normalized,
    edges: normalizedEdges,
  };
}

function buildDryRun(nodes: any[] = [], edges: any[] = [], triggerPayload: any = {}) {
  const validation = validateWorkflowDefinition(nodes, edges);
  const startedAt = new Date().toISOString();
  const executionOrder = resolveExecutionOrder(validation.nodes, validation.edges);
  const steps = executionOrder.map((node, index) => {
    const spec = NODE_CATALOG.find((item) => item.key === node.key);
    const blocked = validation.errors.some((error) => error.includes(node.label));
    return {
      nodeId: node.id,
      label: node.label,
      type: node.type,
      key: node.key,
      status: node.disabled ? 'skipped' : blocked ? 'blocked' : 'would_run',
      order: index + 1,
      input: index === 0 ? triggerPayload : { fromPreviousStep: true },
      output: node.disabled
        ? { reason: 'Node is disabled' }
        : blocked ? { reason: 'Validation error' } : { simulated: true, sideEffects: 'none' },
      durationMs: node.disabled ? 0 : 20 + index * 7,
      evidence: [{ type: 'workflow_node', id: node.id, label: node.label }],
      navigationTarget: { page: 'workflows', entityType: 'workflow_node', entityId: node.id },
      sensitive: Boolean(spec?.sensitive),
    };
  });
  return {
    ok: validation.ok,
    dryRun: true,
    startedAt,
    endedAt: new Date().toISOString(),
    validation,
    steps,
    summary: validation.ok
      ? `Dry-run completed. ${steps.length} node(s) would execute with no real writes.`
      : `Dry-run found ${validation.errors.length} blocker(s).`,
  };
}

function resolveTemplateValue(value: any, context: any) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, path) => {
    const parts = String(path).split('.');
    let cursor = context;
    for (const part of parts) cursor = cursor?.[part];
    return cursor === undefined || cursor === null ? '' : String(cursor);
  });
}

function resolveNodeConfig(config: Record<string, any> = {}, context: any) {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, resolveTemplateValue(value, context)]));
}

function compareValues(left: any, operator: string, right: any) {
  const numericLeft = Number(left);
  const numericRight = Number(right);
  const canCompareNumber = Number.isFinite(numericLeft) && Number.isFinite(numericRight);
  switch (operator) {
    case '>': return canCompareNumber ? numericLeft > numericRight : String(left) > String(right);
    case '>=': return canCompareNumber ? numericLeft >= numericRight : String(left) >= String(right);
    case '<': return canCompareNumber ? numericLeft < numericRight : String(left) < String(right);
    case '<=': return canCompareNumber ? numericLeft <= numericRight : String(left) <= String(right);
    case '!=':
    case '!==': return String(left) !== String(right);
    case '=':
    case '==':
    case '===':
    default: return String(left) === String(right);
  }
}

function readContextPath(context: any, path: string) {
  return String(path || '').split('.').reduce((cursor, part) => cursor?.[part], context);
}

async function buildWorkflowContext(scope: { tenantId: string; workspaceId: string; userId?: string }, payload: any) {
  const context: any = {
    trigger: payload ?? {},
    case: null,
    order: null,
    payment: null,
    return: null,
    agent: {},
    policy: {},
  };

  const caseId = payload?.caseId ?? payload?.case_id;
  if (caseId) {
    const bundle = await caseRepository.getBundle(scope, caseId).catch(() => null);
    if (bundle) {
      context.case = bundle.case;
      context.customer = bundle.customer;
      context.order = bundle.orders?.[0] ?? null;
      context.payment = bundle.payments?.[0] ?? null;
      context.return = bundle.returns?.[0] ?? null;
      context.conversation = bundle.conversation;
    }
  }

  const orderId = payload?.orderId ?? payload?.order_id ?? context.order?.id;
  if (orderId && !context.order) context.order = await commerceRepository.getOrder(scope, orderId).catch(() => null);
  const paymentId = payload?.paymentId ?? payload?.payment_id ?? context.payment?.id;
  if (paymentId && !context.payment) context.payment = await commerceRepository.getPayment(scope, paymentId).catch(() => null);
  const returnId = payload?.returnId ?? payload?.return_id ?? context.return?.id;
  if (returnId && !context.return) context.return = await commerceRepository.getReturn(scope, returnId).catch(() => null);
  return context;
}

function getStartNode(nodes: any[]) {
  return nodes.find((node) => node.type === 'trigger') ?? nodes[0] ?? null;
}

function resolveExecutionOrder(nodes: any[] = [], edges: any[] = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered: any[] = [];
  const visited = new Set<string>();
  let current = getStartNode(nodes);

  while (current && !visited.has(current.id) && ordered.length < nodes.length) {
    ordered.push(current);
    visited.add(current.id);
    const nextEdge = (edges ?? []).find((edge) => edge.source === current.id);
    current = nextEdge ? byId.get(nextEdge.target) : null;
  }

  return ordered.length ? ordered : nodes;
}

function pickNextNode(nodes: any[] = [], edges: any[] = [], currentNode: any, context: any) {
  const outgoing = (edges ?? []).filter((edge) => edge.source === currentNode.id);
  if (outgoing.length === 0) return null;

  if (currentNode.type === 'condition') {
    const expectedLabel = context.condition?.result ? 'true' : 'false';
    const branch = outgoing.find((edge) => String(edge.label ?? '').toLowerCase() === expectedLabel);
    if (branch) return nodes.find((node) => node.id === branch.target) ?? null;
  }

  const next = outgoing.find((edge) => !edge.label || ['next', 'success'].includes(String(edge.label).toLowerCase())) ?? outgoing[0];
  return nodes.find((node) => node.id === next.target) ?? null;
}

function buildStepDryRun(nodes: any[] = [], edges: any[] = [], nodeId: string, triggerPayload: any = {}) {
  const dryRun = buildDryRun(nodes, edges, triggerPayload);
  const executionOrder = dryRun.steps ?? [];
  const index = executionOrder.findIndex((step: any) => step.nodeId === nodeId || step.node_id === nodeId);
  if (index === -1) {
    const error: any = new Error('Workflow node not found');
    error.statusCode = 404;
    throw error;
  }
  const step = executionOrder[index];
  const previous = index > 0 ? executionOrder[index - 1] : null;
  const node = dryRun.validation.nodes.find((item: any) => item.id === nodeId);
  return {
    ok: step.status !== 'blocked',
    dryRun: true,
    nodeId,
    label: step.label,
    status: step.status,
    input: previous?.output ? { previousOutput: previous.output, trigger: triggerPayload } : triggerPayload,
    output: step.output,
    error: step.status === 'blocked' ? step.output?.reason ?? 'Validation error' : null,
    durationMs: step.durationMs ?? 0,
    evidence: step.evidence ?? [{ type: 'workflow_node', id: nodeId, label: step.label }],
    navigationTarget: { page: 'workflows', entityType: 'workflow_node', entityId: nodeId },
    diagnostics: dryRun.validation.diagnostics.filter((diagnostic: any) => !diagnostic.nodeId || diagnostic.nodeId === nodeId),
    parentState: previous ? 'available' : 'root',
    node,
  };
}

function normalizeTriggerName(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '.');
}

function workflowMatchesTrigger(version: any, eventType: string) {
  const normalizedEvent = normalizeTriggerName(eventType);
  const trigger = parseMaybeJsonObject(version?.trigger);
  const triggerType = normalizeTriggerName(trigger?.type ?? trigger?.event);
  const startNode = getStartNode(normalizeNodes(version?.nodes ?? []));
  const nodeTrigger = normalizeTriggerName(startNode?.key);
  const aliases: Record<string, string[]> = {
    'case.created': ['case.created', 'case_created'],
    'message.received': ['message.received', 'message_received'],
    'order.updated': ['order.updated', 'order_updated'],
    'payment.failed': ['payment.failed', 'payment_failed'],
    'return.created': ['return.created', 'return_created'],
    'approval.decided': ['approval.decided', 'approval_decided', 'approval.approved', 'approval.rejected'],
    'webhook.received': ['webhook.received', 'webhook_received'],
    'manual.run': ['manual.run', 'manual'],
  };
  const accepted = new Set([normalizedEvent, ...(aliases[normalizedEvent] ?? []).map(normalizeTriggerName)]);
  return accepted.has(triggerType) || accepted.has(nodeTrigger);
}

async function executeWorkflowNode(scope: { tenantId: string; workspaceId: string; userId?: string }, node: any, context: any) {
  if (node.disabled) {
    return { status: 'skipped', output: { reason: 'Node is disabled' } };
  }

  const config = resolveNodeConfig(node.config ?? {}, context);

  if (node.type === 'trigger') {
    return { status: 'completed', output: { accepted: true, trigger: node.key } };
  }

  if (node.type === 'condition') {
    if (node.key === 'conflict.exists') {
      const result = Boolean(context.case?.has_reconciliation_conflicts || context.order?.has_conflict || context.payment?.has_conflict || context.return?.has_conflict);
      context.condition = { result };
      return { status: result ? 'completed' : 'skipped', output: { result } };
    }
    const left = readContextPath(context, config.field);
    const result = compareValues(left, config.operator ?? '==', config.value);
    context.condition = { result, left, operator: config.operator ?? '==', right: config.value };
    return { status: result ? 'completed' : 'skipped', output: context.condition };
  }

  if (node.key === 'case.assign') {
    if (!context.case?.id) return { status: 'failed', error: 'case.assign requires case context' };
    await caseRepository.update(scope, context.case.id, {
      assigned_user_id: config.user_id || config.userId || null,
      assigned_team_id: config.team_id || config.teamId || null,
    });
    return { status: 'completed', output: { caseId: context.case.id, assigned: true } };
  }

  if (node.key === 'case.note') {
    if (!context.case?.id) return { status: 'failed', error: 'case.note requires case context' };
    const content = config.content || `Workflow note from ${node.label}`;
    const note = await conversationRepository.createInternalNote(scope, {
      caseId: context.case.id,
      content,
      createdBy: scope.userId || 'workflow',
    });
    return { status: 'completed', output: { noteId: note.id, content } };
  }

  if (node.key === 'case.reply') {
    if (!context.case?.id) return { status: 'failed', error: 'case.reply requires case context' };
    const conversation = await conversationRepository.ensureForCase(scope, context.case);
    const message = await conversationRepository.appendMessage(scope, {
      conversationId: conversation.id,
      caseId: context.case.id,
      customerId: context.case.customer_id || null,
      type: 'agent',
      direction: 'outbound',
      senderId: scope.userId || 'workflow',
      senderName: 'Workflow',
      content: config.content || 'Workflow generated reply',
      channel: conversation.channel || 'web_chat',
    });
    return { status: 'completed', output: { messageId: message.id } };
  }

  if (node.key === 'order.cancel') {
    const orderId = config.order_id || config.orderId || context.order?.id;
    if (!orderId) return { status: 'failed', error: 'order.cancel requires order context' };
    const order = await commerceRepository.getOrder(scope, orderId);
    if (!order) return { status: 'failed', error: 'Order not found' };
    const fulfillment = String(order.fulfillment_status ?? order.status ?? '').toLowerCase();
    if (['packed', 'shipped', 'delivered', 'fulfilled'].includes(fulfillment)) {
      return { status: 'waiting_approval', output: { reason: `Order is ${fulfillment}`, orderId } };
    }
    await commerceRepository.updateOrder(scope, orderId, {
      status: 'cancelled',
      approval_status: 'not_required',
      last_update: config.reason || 'Cancelled by workflow',
      system_states: { ...(order.system_states ?? {}), canonical: 'cancelled', workflow: 'cancelled' },
    });
    return { status: 'completed', output: { orderId, status: 'cancelled' } };
  }

  if (node.key === 'payment.refund') {
    const paymentId = config.payment_id || config.paymentId || context.payment?.id;
    if (!paymentId) return { status: 'failed', error: 'payment.refund requires payment context' };
    const payment = await commerceRepository.getPayment(scope, paymentId);
    if (!payment) return { status: 'failed', error: 'Payment not found' };
    const amount = Number(config.amount || payment.amount || 0);
    if (amount > 250 || ['high', 'critical'].includes(String(payment.risk_level ?? '').toLowerCase())) {
      return { status: 'waiting_approval', output: { reason: 'Refund requires approval', paymentId, amount } };
    }
    await commerceRepository.updatePayment(scope, paymentId, {
      status: 'refunded',
      refund_amount: amount,
      refund_type: amount >= Number(payment.amount ?? 0) ? 'full' : 'partial',
      approval_status: 'approved',
      system_states: { ...(payment.system_states ?? {}), canonical: 'refunded', workflow: 'refunded' },
      last_update: config.reason || 'Refunded by workflow',
    });
    return { status: 'completed', output: { paymentId, amount, status: 'refunded' } };
  }

  if (node.key === 'return.create') {
    const returnId = await commerceRepository.upsertReturn(scope, {
      externalId: config.external_return_id || `workflow_return_${Date.now()}`,
      status: config.status || 'pending_review',
      totalAmount: Number(config.amount || context.order?.total_amount || 0),
      currency: config.currency || context.order?.currency || 'USD',
      source: 'workflow',
    });
    await commerceRepository.updateReturn(scope, returnId, {
      order_id: config.order_id || context.order?.id || null,
      customer_id: config.customer_id || context.customer?.id || context.case?.customer_id || null,
      return_reason: config.reason || 'Created by workflow',
      method: config.method || 'workflow',
    });
    return { status: 'completed', output: { returnId } };
  }

  if (node.key === 'approval.create') {
    const approval = await approvalRepository.create(scope, {
      caseId: config.case_id || context.case?.id || null,
      actionType: config.action_type || 'workflow_approval',
      actionPayload: { nodeId: node.id, config, context: { caseId: context.case?.id } },
      riskLevel: config.risk_level || 'medium',
      priority: config.priority || 'normal',
      assignedTeamId: config.team_id || config.queue || null,
      evidencePackage: { workflowNode: node.label },
    });
    return { status: 'waiting_approval', output: { approvalId: approval.id } };
  }

  if (node.key === 'policy.evaluate') {
    const result = { decision: config.decision || 'allow', policy: config.policy || 'default' };
    context.policy = result;
    return { status: result.decision === 'block' ? 'blocked' : 'completed', output: result };
  }

  if (node.key === 'knowledge.search') {
    const query = config.query || config.q || config.content || context.case?.intent || context.case?.summary || context.trigger?.query || '';
    const articles = await knowledgeRepository.listArticles(scope, {
      q: query || undefined,
      status: config.status || 'published',
      type: config.type || undefined,
      domain_id: config.domain_id || config.domainId || undefined,
    });
    const top = articles.slice(0, Number(config.limit || 5)).map((article: any) => ({
      id: article.id,
      title: article.title,
      status: article.status,
      domain: article.domain_name ?? article.domain_id ?? null,
      version: article.version,
    }));
    context.knowledge = { query, articles: top };
    return { status: 'completed', output: { query, count: top.length, articles: top } };
  }

  if (node.key === 'agent.run') {
    const caseId = config.case_id || config.caseId || context.case?.id;
    const agentSlug = config.agent || config.agentSlug || 'triage-agent';
    if (!caseId) return { status: 'failed', error: 'agent.run requires case context' };
    const result = await runAgent({
      agentSlug,
      caseId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      triggerEvent: config.trigger_event || config.triggerEvent || 'workflow_node',
      traceId: `workflow:${node.id}:${Date.now()}`,
      extraContext: {
        workflowNodeId: node.id,
        workflowNodeLabel: node.label,
        workflowTrigger: context.trigger,
      },
    });
    context.agent = {
      slug: agentSlug,
      success: result.success,
      confidence: result.confidence ?? null,
      summary: result.summary ?? result.error ?? null,
      output: result.output ?? {},
    };
    return {
      status: result.success ? 'completed' : 'failed',
      output: context.agent,
      error: result.success ? null : result.error ?? 'Agent execution failed',
    };
  }

  if (node.key === 'connector.call') {
    const connectorId = config.connector_id || config.connectorId || config.connector;
    if (!connectorId) return { status: 'failed', error: 'connector.call requires connector id' };
    const connector = await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId);
    if (!connector) return { status: 'failed', error: 'Connector not found' };
    const capabilities = await integrationRepository.listCapabilities({ tenantId: scope.tenantId }, connectorId);
    const capabilityKey = config.capability || config.capability_key || config.action || capabilities.find((cap: any) => cap.is_enabled !== false)?.capability_key || 'workflow.call';
    const capability = capabilities.find((cap: any) => cap.capability_key === capabilityKey);
    if (capability && capability.is_enabled === false) {
      return { status: 'blocked', output: { reason: 'Connector capability is disabled', connectorId, capabilityKey } };
    }
    if (capability?.requires_approval) {
      const approval = await approvalRepository.create(scope, {
        caseId: context.case?.id ?? null,
        actionType: 'connector.call',
        actionPayload: { connectorId, capabilityKey, nodeId: node.id, config },
        riskLevel: 'medium',
        priority: 'normal',
        evidencePackage: { workflowNode: node.label, connector: connector.system },
      });
      return { status: 'waiting_approval', output: { approvalId: approval.id, connectorId, capabilityKey } };
    }
    const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
      sourceSystem: connector.system,
      sourceEntityType: config.source_entity_type || config.sourceEntityType || 'workflow',
      sourceEntityId: config.source_entity_id || config.sourceEntityId || node.id,
      eventType: capabilityKey,
      eventCategory: 'workflow',
      canonicalEntityType: config.entity_type || config.entityType || (context.case ? 'case' : 'workflow'),
      canonicalEntityId: config.entity_id || config.entityId || context.case?.id || node.id,
      normalizedPayload: {
        nodeId: node.id,
        config,
        trigger: context.trigger,
      },
      dedupeKey: config.dedupe_key || `${node.id}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: 'processed',
    });
    context.integration = { connectorId, system: connector.system, capabilityKey, canonicalEventId: canonicalEvent.id };
    return { status: 'completed', output: context.integration };
  }

  if (['agent', 'integration', 'knowledge'].includes(node.type)) {
    return { status: 'failed', error: `Unsupported ${node.type} node key: ${node.key}` };
  }

  if (node.key === 'delay') {
    return { status: 'waiting', output: { delay: config.duration || 'manual_resume' } };
  }

  if (node.key === 'stop') {
    return { status: 'stopped', output: { stopped: true } };
  }

  return { status: 'completed', output: { simulated: true, key: node.key } };
}

async function executeWorkflowVersion({
  tenantId,
  workspaceId,
  userId,
  workflowId,
  version,
  triggerPayload,
  triggerType = 'manual',
  retryOfRunId = null,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  workflowId: string;
  version: any;
  triggerPayload: any;
  triggerType?: string;
  retryOfRunId?: string | null;
}) {
  const validation = validateWorkflowDefinition(version.nodes ?? [], version.edges ?? []);
  if (!validation.ok) {
    const error: any = new Error('Workflow is not executable');
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }

  const supabase = getSupabaseAdmin();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const workflowContext = await buildWorkflowContext(
    { tenantId, workspaceId, userId },
    triggerPayload ?? {},
  );
  const caseId = triggerPayload?.caseId ?? triggerPayload?.case_id ?? workflowContext.case?.id ?? null;

  const { error: runError } = await supabase.from('workflow_runs').insert({
    id: runId,
    workflow_version_id: version.id,
    case_id: caseId,
    tenant_id: tenantId,
    trigger_type: triggerType,
    trigger_payload: triggerPayload ?? {},
    status: 'running',
    current_node_id: getStartNode(validation.nodes)?.id ?? null,
    context: { dryRun: false, source: retryOfRunId ? 'workflow_retry' : 'workflow_api', retryOfRunId, workflowContext },
    started_at: now,
    ended_at: null,
    error: null,
  });
  if (runError) throw runError;

  const steps: any[] = [];
  const visited = new Set<string>();
  let currentNode = getStartNode(validation.nodes);
  let finalStatus = 'completed';
  let finalError: string | null = null;
  let order = 0;

  while (currentNode && !visited.has(currentNode.id) && order < validation.nodes.length) {
    visited.add(currentNode.id);
    const startedAt = new Date().toISOString();
    const result = await executeWorkflowNode({ tenantId, workspaceId, userId }, currentNode, workflowContext);
    const endedAt = new Date().toISOString();
    const step = {
      id: crypto.randomUUID(),
      workflow_run_id: runId,
      node_id: currentNode.id,
      node_type: currentNode.type,
      status: result.status,
      input: order === 0 ? triggerPayload ?? {} : { fromPreviousStep: true },
      output: result.output ?? {},
      started_at: startedAt,
      ended_at: endedAt,
      error: result.error ?? null,
    };
    steps.push(step);
    order += 1;

    if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) {
      finalStatus = result.status === 'waiting_approval' ? 'waiting' : result.status;
      finalError = result.error ?? result.output?.reason ?? null;
      break;
    }

    currentNode = pickNextNode(validation.nodes, validation.edges, currentNode, workflowContext);
  }

  if (currentNode && visited.has(currentNode.id)) {
    finalStatus = 'failed';
    finalError = `Cycle detected at node ${currentNode.label ?? currentNode.id}`;
  }

  if (steps.length > 0) {
    const { error: stepsError } = await supabase.from('workflow_run_steps').insert(steps);
    if (stepsError) throw stepsError;
  }

  const { error: updateRunError } = await supabase.from('workflow_runs').update({
    status: finalStatus,
    current_node_id: steps.at(-1)?.node_id ?? null,
    context: { dryRun: false, source: retryOfRunId ? 'workflow_retry' : 'workflow_api', retryOfRunId, workflowContext },
    ended_at: ['completed', 'failed', 'blocked', 'stopped'].includes(finalStatus) ? new Date().toISOString() : null,
    error: finalError,
  }).eq('id', runId).eq('tenant_id', tenantId);
  if (updateRunError) throw updateRunError;

  await auditRepository.logEvent({ tenantId, workspaceId }, {
    actorId: userId ?? 'system',
    action: finalStatus === 'completed' ? 'WORKFLOW_RUN_COMPLETED' : 'WORKFLOW_RUN_PAUSED',
    entityType: 'workflow',
    entityId: workflowId,
    metadata: { runId, retryOfRunId, stepCount: steps.length, finalStatus, finalError },
  });

  return { id: runId, status: finalStatus, error: finalError, steps, retryOfRunId };
}

async function continueWorkflowRun({
  tenantId,
  workspaceId,
  userId,
  run,
  version,
  resumePayload,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  run: any;
  version: any;
  resumePayload?: any;
}) {
  if (!PAUSED_STATUSES.has(String(run.status))) {
    const error: any = new Error('Workflow run is not paused or waiting');
    error.statusCode = 409;
    throw error;
  }

  const validation = validateWorkflowDefinition(version.nodes ?? [], version.edges ?? []);
  if (!validation.ok) {
    const error: any = new Error('Workflow is not executable');
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }

  const supabase = getSupabaseAdmin();
  const workflowContext = {
    ...(run.context?.workflowContext ?? {}),
    resume: {
      resumedAt: new Date().toISOString(),
      resumedBy: userId ?? 'system',
      payload: resumePayload ?? {},
    },
  };

  const currentNode = validation.nodes.find((node: any) => node.id === run.current_node_id) ?? null;
  let nextNode = currentNode
    ? pickNextNode(validation.nodes, validation.edges, currentNode, workflowContext)
    : getStartNode(validation.nodes);

  const resumedStep = {
    id: crypto.randomUUID(),
    workflow_run_id: run.id,
    node_id: run.current_node_id ?? 'resume',
    node_type: 'resume',
    status: 'resumed',
    input: resumePayload ?? {},
    output: { resumed: true, previousStatus: run.status },
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    error: null,
  };

  const steps: any[] = [resumedStep];
  const visited = new Set<string>();
  let finalStatus = 'completed';
  let finalError: string | null = null;
  let guard = 0;

  await supabase
    .from('workflow_runs')
    .update({ status: 'running', ended_at: null, error: null })
    .eq('id', run.id)
    .eq('tenant_id', tenantId);

  while (nextNode && !visited.has(nextNode.id) && guard < validation.nodes.length) {
    visited.add(nextNode.id);
    const startedAt = new Date().toISOString();
    const result = await executeWorkflowNode({ tenantId, workspaceId, userId }, nextNode, workflowContext);
    const endedAt = new Date().toISOString();
    steps.push({
      id: crypto.randomUUID(),
      workflow_run_id: run.id,
      node_id: nextNode.id,
      node_type: nextNode.type,
      status: result.status,
      input: { resumed: true, fromPreviousStep: true },
      output: result.output ?? {},
      started_at: startedAt,
      ended_at: endedAt,
      error: result.error ?? null,
    });
    guard += 1;

    if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) {
      finalStatus = result.status === 'waiting_approval' ? 'waiting' : result.status;
      finalError = result.error ?? result.output?.reason ?? null;
      break;
    }

    nextNode = pickNextNode(validation.nodes, validation.edges, nextNode, workflowContext);
  }

  if (nextNode && visited.has(nextNode.id)) {
    finalStatus = 'failed';
    finalError = `Cycle detected at node ${nextNode.label ?? nextNode.id}`;
  }

  const { error: stepsError } = await supabase.from('workflow_run_steps').insert(steps);
  if (stepsError) throw stepsError;

  const { error: runError } = await supabase.from('workflow_runs').update({
    status: finalStatus,
    current_node_id: steps.at(-1)?.node_id ?? run.current_node_id,
    context: { ...(run.context ?? {}), workflowContext, resumedFromRunId: run.id },
    ended_at: ['completed', 'failed', 'blocked', 'stopped', 'cancelled'].includes(finalStatus) ? new Date().toISOString() : null,
    error: finalError,
  }).eq('id', run.id).eq('tenant_id', tenantId);
  if (runError) throw runError;

  await auditRepository.logEvent({ tenantId, workspaceId }, {
    actorId: userId ?? 'system',
    action: finalStatus === 'completed' ? 'WORKFLOW_RUN_RESUMED_COMPLETED' : 'WORKFLOW_RUN_RESUMED_PAUSED',
    entityType: 'workflow_run',
    entityId: run.id,
    metadata: { finalStatus, finalError, stepCount: steps.length },
  });

  return { id: run.id, status: finalStatus, error: finalError, steps };
}

router.get('/', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wfs = await workflowRepository.listDefinitions(tenantId, workspaceId);

    const enriched = await Promise.all(wfs.map(async (workflow: any) => {
      const metrics = await workflowRepository.getMetrics(workflow.id, tenantId);
      const health_status =
        metrics.failed > 0 ? 'warning'
        : workflow.version_status === 'draft' ? 'needs_setup'
        : 'active';

      return {
        ...workflow,
        metrics,
        health_status,
        health_message: health_status === 'warning' ? 'Recent workflow failures detected' : undefined,
        last_run_at: metrics.last_run_at,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const {
      name = 'New workflow draft',
      description = 'Draft workflow created from template',
      nodes = [],
      edges = [],
      trigger = { type: 'manual' },
    } = req.body ?? {};
    const normalizedNodes = normalizeNodes(nodes);
    const normalizedEdges = normalizeEdges(edges);

    await workflowRepository.createDefinition({
      id: workflowId,
      tenantId,
      workspaceId,
      name,
      description,
      currentVersionId: null,
      createdBy: req.userId ?? 'system',
    });

    try {
      await workflowRepository.createVersion({
        id: versionId,
        workflowId,
        versionNumber: 1,
        status: 'draft',
        nodes: normalizedNodes,
        edges: normalizedEdges,
        trigger: parseMaybeJsonObject(trigger),
        tenantId,
      });

      await workflowRepository.updateDefinition(workflowId, tenantId, workspaceId, {
        currentVersionId: versionId,
      });
    } catch (versionError) {
      const supabase = getSupabaseAdmin();
      await supabase.from('workflow_versions').delete().eq('id', versionId).catch(() => null);
      await supabase.from('workflow_definitions').delete().eq('id', workflowId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId).catch(() => null);
      throw versionError;
    }

    const workflow = await workflowRepository.getDefinition(workflowId, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(versionId);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_CREATED',
      entityType: 'workflow',
      entityId: workflowId,
      newValue: { workflow, version },
    });

    res.status(201).json({
      ...workflow,
      current_version: version,
      metrics: await workflowRepository.getMetrics(workflowId, tenantId),
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/catalog', requirePermission('workflows.read'), async (_req: MultiTenantRequest, res) => {
  res.json({
    categories: Array.from(new Set(NODE_CATALOG.map((node) => node.category))),
    nodes: NODE_CATALOG,
  });
});

router.get('/runs/recent', async (req: MultiTenantRequest, res) => {
  try {
    const runs = await workflowRepository.listRecentRuns(req.tenantId!);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching recent runs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/:runId', requirePermission('workflows.read'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(workflow_id, workflow_definitions!inner(name)), cases(case_number)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });

    const { data: steps, error: stepsError } = await supabase
      .from('workflow_run_steps')
      .select('*')
      .eq('workflow_run_id', run.id)
      .order('started_at', { ascending: true });
    if (stepsError) throw stepsError;

    res.json({
      ...run,
      workflow_name: run.workflow_versions?.workflow_definitions?.name,
      workflow_id: run.workflow_versions?.workflow_id,
      case_number: run.cases?.case_number,
      steps: steps ?? [],
    });
  } catch (error) {
    console.error('Error fetching workflow run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/runs/:runId/resume', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(id, workflow_id, status, nodes, edges, trigger)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (runError) throw runError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });
    const result = await continueWorkflowRun({
      tenantId,
      workspaceId,
      userId: req.userId,
      run,
      version: run.workflow_versions,
      resumePayload: req.body ?? {},
    });

    res.json(result);
  } catch (error) {
    console.error('Error resuming workflow run:', error);
    const status = (error as any)?.statusCode ?? 500;
    res.status(status).json({ error: status === 409 ? (error as Error).message : 'Internal server error', validation: (error as any)?.validation });
  }
});

router.post('/runs/:runId/cancel', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data: run, error: fetchError } = await supabase
      .from('workflow_runs')
      .select('*')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });

    const { error } = await supabase
      .from('workflow_runs')
      .update({
        status: 'cancelled',
        ended_at: now,
        error: req.body?.reason ?? 'Cancelled manually',
        context: { ...(run.context ?? {}), cancelledAt: now, cancelledBy: req.userId ?? 'system' },
      })
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId);
    if (error) throw error;

    const step = {
      id: crypto.randomUUID(),
      workflow_run_id: req.params.runId,
      node_id: run.current_node_id ?? 'cancel',
      node_type: 'cancel',
      status: 'cancelled',
      input: req.body ?? {},
      output: { cancelled: true },
      started_at: now,
      ended_at: now,
      error: req.body?.reason ?? null,
    };
    await supabase.from('workflow_run_steps').insert(step);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_RUN_CANCELLED',
      entityType: 'workflow_run',
      entityId: req.params.runId,
      metadata: { reason: req.body?.reason ?? null },
    });

    res.json({ id: req.params.runId, status: 'cancelled', steps: [step] });
  } catch (error) {
    console.error('Error cancelling workflow run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/runs/:runId/retry', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const { data: previousRun, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(id, workflow_id, status, nodes, edges, trigger)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (runError) throw runError;
    if (!previousRun) return res.status(404).json({ error: 'Workflow run not found' });

    const version = previousRun.workflow_versions;
    if (!version) return res.status(404).json({ error: 'Workflow version not found for run' });

    await supabase
      .from('workflow_runs')
      .update({ status: 'retrying' })
      .eq('id', previousRun.id)
      .eq('tenant_id', tenantId);

    const result = await executeWorkflowVersion({
      tenantId,
      workspaceId,
      userId: req.userId,
      workflowId: version.workflow_id,
      version,
      triggerPayload: req.body?.triggerPayload ?? previousRun.trigger_payload ?? {},
      triggerType: 'retry',
      retryOfRunId: previousRun.id,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error retrying workflow run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/events/trigger', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const eventType = req.body?.eventType ?? req.body?.event_type;
    if (!eventType) return res.status(400).json({ error: 'eventType is required' });

    const workflows = await workflowRepository.listDefinitions(tenantId, workspaceId);
    const results: any[] = [];

    for (const workflow of workflows) {
      if (workflow.version_status !== 'published' || !workflow.current_version_id) continue;
      const version = await workflowRepository.getVersion(workflow.current_version_id);
      if (!version || !workflowMatchesTrigger(version, eventType)) continue;

      const result = await executeWorkflowVersion({
        tenantId,
        workspaceId,
        userId: req.userId,
        workflowId: workflow.id,
        version,
        triggerPayload: {
          ...(req.body?.payload ?? req.body?.triggerPayload ?? {}),
          eventType,
        },
        triggerType: normalizeTriggerName(eventType),
      });
      results.push({ workflowId: workflow.id, workflowName: workflow.name, ...result });
    }

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_EVENT_TRIGGERED',
      entityType: 'workflow_event',
      entityId: normalizeTriggerName(eventType),
      metadata: { eventType, matched: results.length, runIds: results.map((run) => run.id) },
    });

    res.status(202).json({
      eventType,
      matched: results.length,
      runs: results,
    });
  } catch (error) {
    console.error('Error triggering workflows by event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const versions = await workflowRepository.listVersions(wf.id);
    const runs = await workflowRepository.listRunsByWorkflow(wf.id, tenantId);
    const currentVersion = await (wf.current_version_id 
      ? workflowRepository.getVersion(wf.current_version_id) 
      : workflowRepository.getLatestVersion(wf.id));

    res.json({
      ...wf,
      current_version: currentVersion,
      versions,
      recent_runs: runs,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const currentVersion = await (wf.current_version_id 
      ? workflowRepository.getVersion(wf.current_version_id) 
      : workflowRepository.getLatestVersion(wf.id));

    const nextVersionNumber = currentVersion ? Number(currentVersion.version_number || 0) + 1 : 1;
    const draftId = currentVersion?.status === 'draft' ? currentVersion.id : crypto.randomUUID();
    
    const updates = {
      nodes: normalizeNodes(req.body.nodes ?? currentVersion?.nodes ?? []),
      edges: normalizeEdges(req.body.edges ?? currentVersion?.edges ?? []),
      trigger: parseMaybeJsonObject(req.body.trigger ?? currentVersion?.trigger ?? {}),
    };

    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, {
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
    });

    if (currentVersion?.status === 'draft') {
      await workflowRepository.updateVersion(draftId, updates);
    } else {
      await workflowRepository.createVersion({
        id: draftId,
        workflowId: wf.id,
        versionNumber: nextVersionNumber,
        status: 'draft',
        ...updates,
        tenantId,
      });
    }

    const draftVersion = await workflowRepository.getVersion(draftId);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRAFT_UPDATED',
      entityType: 'workflow',
      entityId: wf.id,
      oldValue: { workflow: wf, version: currentVersion },
      newValue: { workflow: { ...wf, ...req.body }, version: draftVersion },
    });

    res.json({
      ...wf,
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
      current_version: draftVersion,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/validate', requirePermission('workflows.read'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    res.json(validateWorkflowDefinition(req.body?.nodes ?? version?.nodes ?? [], req.body?.edges ?? version?.edges ?? []));
  } catch (error) {
    console.error('Error validating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/dry-run', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    const dryRun = buildDryRun(
      req.body?.nodes ?? version?.nodes ?? [],
      req.body?.edges ?? version?.edges ?? [],
      req.body?.triggerPayload ?? { workflowId: wf.id, manual: true },
    );
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRY_RUN',
      entityType: 'workflow',
      entityId: wf.id,
      metadata: { ok: dryRun.ok, errors: dryRun.validation.errors },
    });
    res.json(dryRun);
  } catch (error) {
    console.error('Error running workflow dry-run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/step-run', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    const nodeId = req.body?.nodeId ?? req.body?.node_id;
    if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });
    const result = buildStepDryRun(
      req.body?.nodes ?? version?.nodes ?? [],
      req.body?.edges ?? version?.edges ?? [],
      nodeId,
      req.body?.triggerPayload ?? { workflowId: wf.id, manual: true, source: 'step-run' },
    );
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_STEP_DRY_RUN',
      entityType: 'workflow',
      entityId: wf.id,
      metadata: { nodeId, status: result.status, ok: result.ok },
    });
    res.json(result);
  } catch (error) {
    console.error('Error running workflow step dry-run:', error);
    const status = (error as any)?.statusCode ?? 500;
    res.status(status).json({ error: status === 404 ? 'Workflow node not found' : 'Internal server error' });
  }
});

router.post('/:id/run', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    if (!version || version.status !== 'published') {
      return res.status(409).json({ error: 'Workflow must be published before execution' });
    }
    const result = await executeWorkflowVersion({
      tenantId,
      workspaceId,
      userId: req.userId,
      workflowId: wf.id,
      version,
      triggerPayload: req.body?.triggerPayload ?? { caseId: req.body?.caseId ?? req.body?.case_id ?? null },
      triggerType: req.body?.triggerType ?? 'manual',
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error running workflow:', error);
    if ((error as any)?.statusCode === 422) {
      return res.status(422).json({ error: 'Workflow is not executable', validation: (error as any).validation });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/rollback', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const versions = await workflowRepository.listVersions(wf.id);
    const target = req.body?.versionId
      ? versions.find((version) => version.id === req.body.versionId)
      : versions.find((version) => version.status === 'archived') ?? versions[1];
    if (!target) return res.status(404).json({ error: 'No rollback target available' });

    if (wf.current_version_id && wf.current_version_id !== target.id) {
      await workflowRepository.updateVersion(wf.current_version_id, { status: 'archived' });
    }
    await workflowRepository.updateVersion(target.id, {
      status: 'published',
      publishedBy: req.userId ?? 'system',
      publishedAt: new Date().toISOString(),
    });
    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, { currentVersionId: target.id });
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_ROLLED_BACK',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { versionId: target.id, versionNumber: target.version_number },
    });
    const workflow = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    res.json({ ...workflow, current_version: target, metrics: await workflowRepository.getMetrics(wf.id, tenantId) });
  } catch (error) {
    console.error('Error rolling back workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/publish', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const versions = await workflowRepository.listVersions(wf.id);
    const draftVersion = versions.find(v => v.status === 'draft');

    if (!draftVersion) {
      return res.status(400).json({ error: 'No draft version available to publish' });
    }

    const validation = validateWorkflowDefinition(draftVersion.nodes ?? [], draftVersion.edges ?? []);
    if (!validation.ok) {
      return res.status(422).json({
        error: 'Workflow cannot be published until validation passes',
        validation,
      });
    }

    const now = new Date().toISOString();
    if (wf.current_version_id && wf.current_version_id !== draftVersion.id) {
      await workflowRepository.updateVersion(wf.current_version_id, { status: 'archived' });
    }

    await workflowRepository.updateVersion(draftVersion.id, {
      status: 'published',
      publishedBy: req.userId ?? 'system',
      publishedAt: now,
    });

    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, {
      currentVersionId: draftVersion.id,
    });

    const updated = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(draftVersion.id);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_PUBLISHED',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { workflow: updated, version },
    });

    res.json({
      ...updated,
      current_version: version,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error publishing workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
